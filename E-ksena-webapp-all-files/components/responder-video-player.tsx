import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform, Pressable } from 'react-native';
import { supabase } from '@/lib/supabase';
import {
  Spacing,
  FontSizes,
  Radius,
  WHITE,
  BORDER,
  TEXT_SECONDARY,
  SUCCESS,
  BRAND_RED,
} from '@/constants/theme';

const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

/**
 * A TURN relay is optional. Without one a call only connects when the phone and this computer can
 * reach each other directly, which in practice means the same Wi-Fi or hotspot.
 */
function iceServers(): RTCIceServer[] {
  const url = process.env.EXPO_PUBLIC_TURN_URL;
  if (!url) return STUN_SERVERS;
  return [
    ...STUN_SERVERS,
    {
      urls: url
        .split(',')
        .map((u) => u.trim())
        .filter(Boolean),
      username: process.env.EXPO_PUBLIC_TURN_USERNAME,
      credential: process.env.EXPO_PUBLIC_TURN_CREDENTIAL,
    },
  ];
}

/** How long to wait for an offer before telling the phone we joined late and missed it. */
const READY_DELAY_MS = 1500;
/** How long to collect our own network addresses before answering, so they travel inside the answer. */
const GATHER_TIMEOUT_MS = 1500;
/** The phone drops addresses that reach it while it is still applying the answer, so later ones wait. */
const TRICKLE_DELAY_MS = 700;
/** How long a retry may take before the call is reported as failed. */
const RETRY_TIMEOUT_MS = 8000;
const MAX_RETRIES = 1;
/** How long a call may take to connect before the box gives up and returns to the recording. */
const CONNECT_TIMEOUT_MS = 12000;

type ConnectionState = 'idle' | 'waiting' | 'connecting' | 'live' | 'ended' | 'error';

const STATUS_LABELS: Record<ConnectionState, string> = {
  idle: 'Live video unavailable',
  waiting: 'Waiting for the caller to start streaming…',
  connecting: 'Incoming call — connecting…',
  live: 'Live stream connected',
  ended: 'Call ended',
  error: 'Connection error',
};

type SignalPayload =
  | { type: 'offer'; offer: RTCSessionDescriptionInit; sender: string }
  | { type: 'answer'; answer: RTCSessionDescriptionInit; sender: string }
  | { type: 'candidate'; candidate: RTCIceCandidateInit; sender: string }
  | { type: 'ready'; sender: string };

/** The id in the SDP origin line. It stays the same for a retry and changes for a new call. */
function sessionIdOf(sdp: string | undefined): string | null {
  const match = sdp ? /^o=\S+ (\S+) /m.exec(sdp) : null;
  return match ? match[1] : null;
}

function candidateType(candidate: string | undefined | null): string | null {
  const match = candidate ? / typ (\w+)/.exec(candidate) : null;
  return match ? match[1] : null;
}

function errorText(err: unknown): string {
  return err && typeof err === 'object' && 'message' in err
    ? String((err as { message: unknown }).message)
    : String(err);
}

export function ResponderVideoPlayer({
  incidentId,
  recordedVideoUrl,
}: {
  incidentId?: string | null;
  /** The clip sent with the report. Shown whenever no live stream is connected. */
  recordedVideoUrl?: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [state, setState] = useState<ConnectionState>('idle');
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [needsTap, setNeedsTap] = useState(false);
  const [muted, setMuted] = useState(true);
  const [diag, setDiag] = useState<string | null>(null);
  const [recordingFailed, setRecordingFailed] = useState(false);

  useEffect(() => {
    setRecordingFailed(false);
  }, [recordedVideoUrl]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!incidentId) {
      setState('idle');
      return;
    }
    if (typeof RTCPeerConnection === 'undefined') {
      setState('error');
      setErrorDetail('This browser does not support WebRTC.');
      return;
    }

    setState('waiting');
    setErrorDetail(null);
    setNeedsTap(false);
    setMuted(true);
    setDiag(null);

    let cancelled = false;
    let subscribed = false;
    let pc: RTCPeerConnection | null = null;
    let sessionId: string | null = null;
    let offerSeen = false;
    let answerSentAt = 0;
    let retries = 0;
    let attempt = 0;
    let offerCount = 0;
    // Offers are handled one at a time: a second one must wait until the first is answered.
    let work: Promise<void> = Promise.resolve();
    let pendingRemote: RTCIceCandidateInit[] = [];
    const remoteTypes = new Set<string>();
    const localTypes = new Set<string>();
    const timers: ReturnType<typeof setTimeout>[] = [];

    const channel = supabase.channel(`webrtc-incident-${incidentId}`);

    const sendSignal = (payload: SignalPayload) => {
      channel.send({ type: 'broadcast', event: 'webrtc-signaling', payload });
    };

    const later = (fn: () => void, ms: number) => {
      timers.push(
        setTimeout(() => {
          if (!cancelled) fn();
        }, ms)
      );
    };

    const closePc = () => {
      if (!pc) return;
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.close();
      pc = null;
    };

    const failureReason = (): string => {
      if (remoteTypes.size === 0) {
        return 'The call was offered, but the phone sent no network addresses. Ask the caller to end the call and start it again.';
      }
      if (!remoteTypes.has('relay') && !localTypes.has('relay')) {
        return 'The phone and this computer could not reach each other. Put both on the same Wi-Fi or hotspot, then ask the caller to call again.';
      }
      return 'The connection to the caller dropped. They may have lost signal.';
    };

    // A one-line summary of the attempt, so a screenshot is enough to see where a call got stuck.
    const report = () => {
      if (cancelled) return;
      const list = (set: Set<string>) => [...set].sort().join('/') || 'none';
      setDiag(
        `offers ${offerCount} · phone sent: ${list(remoteTypes)} · this computer: ${list(localTypes)} · link: ${pc ? pc.iceConnectionState : 'none'}`
      );
    };

    const fail = () => {
      setState('error');
      setNeedsTap(false);
      setErrorDetail(failureReason());
      report();
    };

    // Runs when an attempt has not connected. A black box that waits forever is worse than no call:
    // try once more only if the phone sent nothing at all, otherwise stop and show the recording again.
    const giveUpOrRetry = (target: RTCPeerConnection, myAttempt: number) => {
      if (cancelled || pc !== target || attempt !== myAttempt) return;
      if (target.connectionState === 'connected') return;
      if (remoteTypes.size === 0 && retries < MAX_RETRIES && subscribed) {
        retries += 1;
        sendSignal({ type: 'ready', sender: 'responder' });
        later(() => {
          if (pc === target && attempt === myAttempt && target.connectionState !== 'connected') fail();
        }, RETRY_TIMEOUT_MS);
        return;
      }
      fail();
    };

    const createPc = (): RTCPeerConnection => {
      const next = new RTCPeerConnection({ iceServers: iceServers() });
      remoteTypes.clear();
      localTypes.clear();
      answerSentAt = 0;

      next.ontrack = (event) => {
        if (cancelled || pc !== next) return;
        const stream = event.streams[0];
        const video = videoRef.current;
        if (!video || !stream) return;
        video.srcObject = stream;
        // Muted playback is always allowed to start. With sound, the browser wants a tap first,
        // which would leave a responder looking at a black box.
        video.muted = true;
        setMuted(true);
        video.play().then(
          () => setNeedsTap(false),
          () => setNeedsTap(true)
        );
      };

      next.onicecandidate = (event) => {
        if (!event.candidate || pc !== next) return;
        const candidate = event.candidate.toJSON();
        const type = candidateType(candidate.candidate);
        if (type) localTypes.add(type);
        report();
        // Addresses found before the answer goes out travel inside it; only later ones are sent alone.
        if (!answerSentAt) return;
        const wait = Math.max(0, answerSentAt + TRICKLE_DELAY_MS - Date.now());
        later(() => {
          if (pc === next) sendSignal({ type: 'candidate', candidate, sender: 'responder' });
        }, wait);
      };

      next.onconnectionstatechange = () => {
        if (cancelled || pc !== next) return;
        const connection = next.connectionState;
        if (connection === 'connected') {
          // Only now is video actually flowing. An accepted offer alone proves nothing.
          retries = 0;
          setErrorDetail(null);
          setState('live');
          report();
        } else if (connection === 'failed') {
          giveUpOrRetry(next, attempt);
        } else if (connection === 'disconnected' || connection === 'closed') {
          setState('ended');
        }
      };

      next.oniceconnectionstatechange = () => {
        if (pc === next) report();
      };

      return next;
    };

    const gatheringDone = (target: RTCPeerConnection) =>
      new Promise<void>((resolve) => {
        if (target.iceGatheringState === 'complete') {
          resolve();
          return;
        }
        const finish = () => {
          target.removeEventListener('icegatheringstatechange', onChange);
          resolve();
        };
        const onChange = () => {
          if (target.iceGatheringState === 'complete') finish();
        };
        target.addEventListener('icegatheringstatechange', onChange);
        setTimeout(finish, GATHER_TIMEOUT_MS);
      });

    const answerOffer = async (offer: RTCSessionDescriptionInit) => {
      if (cancelled) return;
      offerSeen = true;
      offerCount += 1;
      attempt += 1;
      const myAttempt = attempt;
      setState('connecting');
      setErrorDetail(null);
      // Anything queued before this offer belongs to an earlier attempt.
      pendingRemote = [];

      const incoming = sessionIdOf(offer.sdp);
      const isNewCall = !!incoming && !!sessionId && incoming !== sessionId;
      let current: RTCPeerConnection | null = pc;
      if (!current || current.connectionState === 'closed' || isNewCall) {
        closePc();
        current = createPc();
        pc = current;
      }
      sessionId = incoming ?? sessionId;
      answerSentAt = 0;

      try {
        await current.setRemoteDescription(new RTCSessionDescription(offer));
      } catch {
        // The offer could not be applied as a retry of the existing call, so start clean.
        if (cancelled) return;
        closePc();
        current = createPc();
        pc = current;
        await current.setRemoteDescription(new RTCSessionDescription(offer));
      }

      for (const line of offer.sdp?.match(/^a=candidate:.*$/gm) ?? []) {
        const type = candidateType(line);
        if (type) remoteTypes.add(type);
      }
      for (const candidate of pendingRemote.splice(0)) {
        await current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => undefined);
      }

      const answer = await current.createAnswer();
      await current.setLocalDescription(answer);
      await gatheringDone(current);
      if (cancelled || pc !== current) return;

      const local = current.localDescription;
      sendSignal({
        type: 'answer',
        answer: local ? { type: local.type, sdp: local.sdp } : answer,
        sender: 'responder',
      });
      answerSentAt = Date.now();
      report();
      const target = current;
      later(() => giveUpOrRetry(target, myAttempt), CONNECT_TIMEOUT_MS);
    };

    channel.on('broadcast', { event: 'webrtc-signaling' }, ({ payload }) => {
      const signal = payload as SignalPayload;
      if (!signal || signal.sender === 'responder' || cancelled) return;

      if (signal.type === 'offer' && signal.offer) {
        const offer = signal.offer;
        work = work
          .then(() => answerOffer(offer))
          .catch((err: unknown) => {
            if (cancelled) return;
            setState('error');
            setErrorDetail(errorText(err));
          });
      } else if (signal.type === 'candidate' && signal.candidate) {
        const type = candidateType(signal.candidate.candidate);
        if (type) remoteTypes.add(type);
        report();
        const target = pc;
        if (target && target.remoteDescription) {
          target.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(() => undefined);
        } else {
          pendingRemote.push(signal.candidate);
        }
      }
    });

    channel.subscribe((status) => {
      if (status !== 'SUBSCRIBED' || cancelled) return;
      subscribed = true;
      // The phone sends its offer once, when its call starts. If the call was already running when
      // this card opened, that offer is gone; "ready" asks the phone to send it again. The short
      // wait avoids asking for a second offer while the first is still on its way.
      later(() => {
        if (!offerSeen) sendSignal({ type: 'ready', sender: 'responder' });
      }, READY_DELAY_MS);
    });

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      if (videoRef.current) videoRef.current.srcObject = null;
      closePc();
      supabase.removeChannel(channel);
    };
  }, [incidentId]);

  if (Platform.OS !== 'web') {
    return (
      <View style={styles.card}>
        <Text style={styles.unavailableText}>Live video is only available on the web dashboard.</Text>
      </View>
    );
  }

  if (!incidentId && !recordedVideoUrl) {
    return (
      <View style={styles.card}>
        <Text style={styles.unavailableText}>
          No live video for this report. Only emergencies submitted through the citizen mobile app
          have a caller streaming video.
        </Text>
      </View>
    );
  }

  const isLive = state === 'live';
  const isConnecting = state === 'connecting';
  // A call takes over the box from the moment the caller starts it, not only once video arrives.
  // The recording comes back when the call ends or fails.
  const callActive = isLive || isConnecting;
  const showRecording = !callActive && !!recordedVideoUrl;
  // The box is for the recorded clip first. The live stream is only mentioned when a call is
  // actually coming in or connected.
  const headerText = isLive
    ? STATUS_LABELS.live
    : isConnecting
      ? STATUS_LABELS.connecting
      : recordedVideoUrl
        ? 'Recorded video from the caller'
        : 'No recorded video for this report';
  const liveNote = !incidentId
    ? null
    : state === 'ended'
      ? 'The live call has ended.'
      : state === 'error'
        ? 'The live call could not connect.'
        : state === 'waiting'
          ? 'If the caller starts a call, the live stream will play here.'
          : null;

  return (
    <View style={styles.card}>
      <View style={styles.statusRow}>
        <View style={[styles.dot, isLive ? styles.dotLive : styles.dotIdle]} />
        <Text style={styles.statusText}>{headerText}</Text>
      </View>

      <View style={styles.videoFrame}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            backgroundColor: '#000',
            // Kept mounted while hidden so an incoming stream still has an element to attach to.
            display: showRecording ? 'none' : 'block',
          }}
        />
        {showRecording && !recordingFailed ? (
          <video
            key={recordedVideoUrl ?? ''}
            src={recordedVideoUrl ?? undefined}
            controls
            autoPlay
            muted
            loop
            playsInline
            onError={() => setRecordingFailed(true)}
            style={{ width: '100%', height: '100%', objectFit: 'contain', backgroundColor: '#000', display: 'block' }}
          />
        ) : null}
        {showRecording && recordingFailed ? (
          <View style={styles.tapOverlay}>
            <Text style={styles.tapOverlayText}>The recorded video could not be loaded.</Text>
            <Text style={styles.tapOverlayHint}>The file may have been removed or the connection dropped.</Text>
          </View>
        ) : null}
        {!isLive && !isConnecting && !recordedVideoUrl ? (
          <View style={styles.tapOverlay}>
            <Text style={styles.tapOverlayText}>No recorded video</Text>
            <Text style={styles.tapOverlayHint}>This report reached the dashboard without a video from the phone.</Text>
          </View>
        ) : null}
        {isConnecting ? (
          <View style={styles.connectingOverlay} pointerEvents="none">
            <Text style={styles.tapOverlayText}>Connecting to the caller…</Text>
            <Text style={styles.tapOverlayHint}>The live stream will appear here in a moment.</Text>
          </View>
        ) : null}
        {isLive && needsTap ? (
          <Pressable
            style={styles.tapOverlay}
            onPress={() => {
              videoRef.current?.play().then(
                () => setNeedsTap(false),
                () => setNeedsTap(true)
              );
            }}
          >
            <Text style={styles.tapOverlayText}>Tap to play the live stream</Text>
            <Text style={styles.tapOverlayHint}>The browser paused the stream. Tap to start it.</Text>
          </Pressable>
        ) : null}
        {isLive && !needsTap && muted ? (
          <Pressable
            style={styles.soundBtn}
            accessibilityRole="button"
            accessibilityLabel="Turn on sound"
            onPress={() => {
              const video = videoRef.current;
              if (!video) return;
              video.muted = false;
              setMuted(false);
            }}
          >
            <Text style={styles.soundBtnText}>Tap for sound</Text>
          </Pressable>
        ) : null}
      </View>

      {!isLive && liveNote ? <Text style={styles.noteText}>{liveNote}</Text> : null}
      {errorDetail ? <Text style={styles.errorText}>{errorDetail}</Text> : null}
      {diag && (state === 'error' || isConnecting) ? <Text style={styles.diagText}>Call details: {diag}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.lg,
    backgroundColor: WHITE,
    overflow: 'hidden',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotLive: {
    backgroundColor: SUCCESS,
  },
  dotIdle: {
    backgroundColor: TEXT_SECONDARY,
  },
  statusText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: TEXT_SECONDARY,
  },
  videoFrame: {
    width: '100%',
    height: 260,
    backgroundColor: '#000',
    position: 'relative',
  },
  tapOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  connectingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
  },
  tapOverlayText: {
    fontSize: FontSizes.body,
    fontWeight: '700',
    color: WHITE,
    marginBottom: Spacing.xs,
  },
  tapOverlayHint: {
    fontSize: FontSizes.xs,
    color: '#D7DCE2',
    textAlign: 'center',
  },
  soundBtn: {
    position: 'absolute',
    left: Spacing.sm,
    bottom: Spacing.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  soundBtnText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: WHITE,
  },
  unavailableText: {
    fontSize: FontSizes.sm,
    color: TEXT_SECONDARY,
    padding: Spacing.md,
  },
  noteText: {
    fontSize: FontSizes.xs,
    color: TEXT_SECONDARY,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  diagText: {
    fontSize: FontSizes.xs,
    color: TEXT_SECONDARY,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  errorText: {
    fontSize: FontSizes.xs,
    color: BRAND_RED,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
});
