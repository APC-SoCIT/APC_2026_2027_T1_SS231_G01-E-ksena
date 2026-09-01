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

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

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
  | { type: 'candidate'; candidate: RTCIceCandidateInit; sender: string };

export function ResponderVideoPlayer({ incidentId }: { incidentId?: string | null }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [state, setState] = useState<ConnectionState>('idle');
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [needsTap, setNeedsTap] = useState(false);

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

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    const pendingCandidates: RTCIceCandidateInit[] = [];
    const outgoingCandidates: RTCIceCandidateInit[] = [];
    let subscribed = false;
    let cancelled = false;

    const channel = supabase.channel(`webrtc-incident-${incidentId}`);

    const sendSignal = (payload: SignalPayload) => {
      channel.send({ type: 'broadcast', event: 'webrtc-signaling', payload });
    };

    pc.ontrack = (event) => {
      if (cancelled) return;
      const stream = event.streams[0];
      if (videoRef.current && stream) {
        videoRef.current.srcObject = stream;
        setState('live');
        videoRef.current.play().then(
          () => setNeedsTap(false),
          () => setNeedsTap(true)
        );
      }
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      const candidate = event.candidate.toJSON();
      if (subscribed) {
        sendSignal({ type: 'candidate', candidate, sender: 'responder' });
      } else {
        outgoingCandidates.push(candidate);
      }
    };

    pc.onconnectionstatechange = () => {
      if (cancelled) return;
      if (pc.connectionState === 'failed') {
        setState('error');
        setErrorDetail('The peer connection failed. The caller may have lost signal.');
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
        setState('ended');
      }
    };

    channel.on('broadcast', { event: 'webrtc-signaling' }, async ({ payload }) => {
      const signal = payload as SignalPayload;
      if (!signal || signal.sender === 'responder') return;

      try {
        if (signal.type === 'offer') {
          setState('connecting');
          await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));

          for (const candidate of pendingCandidates.splice(0)) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          }

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal({ type: 'answer', answer, sender: 'responder' });
        } else if (signal.type === 'candidate' && signal.candidate) {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } else {
            pendingCandidates.push(signal.candidate);
          }
        }
      } catch (err: unknown) {
        if (cancelled) return;
        setState('error');
        setErrorDetail(
          err && typeof err === 'object' && 'message' in err
            ? String((err as { message: unknown }).message)
            : String(err)
        );
      }
    });

    channel.subscribe((status) => {
      if (status !== 'SUBSCRIBED' || cancelled) return;
      subscribed = true;
      for (const candidate of outgoingCandidates.splice(0)) {
        sendSignal({ type: 'candidate', candidate, sender: 'responder' });
      }
    });

    return () => {
      cancelled = true;
      if (videoRef.current) videoRef.current.srcObject = null;
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.onconnectionstatechange = null;
      pc.close();
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

  if (!incidentId) {
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

  return (
    <View style={styles.card}>
      <View style={styles.statusRow}>
        <View style={[styles.dot, isLive ? styles.dotLive : styles.dotIdle]} />
        <Text style={styles.statusText}>{STATUS_LABELS[state]}</Text>
      </View>

      <View style={styles.videoFrame}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover', backgroundColor: '#000', display: 'block' }}
        />
        {needsTap ? (
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
            <Text style={styles.tapOverlayHint}>
              The browser blocked automatic playback because the stream has audio.
            </Text>
          </Pressable>
        ) : null}
      </View>

      {errorDetail ? <Text style={styles.errorText}>{errorDetail}</Text> : null}
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
  unavailableText: {
    fontSize: FontSizes.sm,
    color: TEXT_SECONDARY,
    padding: Spacing.md,
  },
  errorText: {
    fontSize: FontSizes.xs,
    color: BRAND_RED,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
});
