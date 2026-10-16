import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { RTCPeerConnection, RTCIceCandidate, RTCSessionDescription, RTCView, mediaDevices, MediaStream } from 'react-native-webrtc';
import { PhoneOff, SwitchCamera } from 'lucide-react-native';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../context/AuthContext';

const configuration = {
  iceServers: [
    {
      urls: 'stun:stun.l.google.com:19302'
    },
    {
      urls: 'stun:stun1.l.google.com:19302'
    },
    {
      urls: 'stun:stun2.l.google.com:19302'
    },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
        'turns:openrelay.metered.ca:443?transport=tcp'
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ],
  iceCandidatePoolSize: 10
};

export default function CallScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { incidentId, responderPhone } = route.params as { incidentId: string, responderPhone: string };
  const { state } = useAuth();
  
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  
  const pc = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<any>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingRemoteCandidates = useRef<any[]>([]);
  const callSessionRef = useRef(0);

  useEffect(() => {
    startCall();
    
    return () => {
      cleanupCall();
    };
  }, []);

  const cleanupCall = () => {
    // Invalidate any pending getUserMedia request from an older effect/session.
    callSessionRef.current += 1;

    localStreamRef.current?.getTracks().forEach(track => track.stop());
    localStreamRef.current = null;
    pendingRemoteCandidates.current = [];
    pc.current?.close();
    pc.current = null;

    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  };

  const startCall = async () => {
    const callSession = callSessionRef.current + 1;
    callSessionRef.current = callSession;

    try {
      // 1. Get local media stream
      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: { width: 640, height: 480, frameRate: 30, facingMode: 'user' }
      }) as MediaStream;

      // The permission prompt can resolve after the user has already left.
      if (callSession !== callSessionRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      
      localStreamRef.current = stream;
      setLocalStream(stream);

      // 2. Initialize Peer Connection with STUN and TURN
      pc.current = new RTCPeerConnection(configuration);

      // Add local tracks to PeerConnection
      stream.getTracks().forEach((track) => {
        track.enabled = true;
        pc.current?.addTrack(track, stream);
      });

      // Handle receiving remote stream
      pc.current.ontrack = (event: any) => {
        console.log('[WebRTC] Received remote stream track:', event.track?.kind);
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
          if (event.track?.kind === 'video') {
            setHasRemoteVideo(true);
            event.track.onended = () => setHasRemoteVideo(false);
          }
          setIsConnecting(false);
        }
      };

      // Connection State monitoring
      (pc.current as any).onconnectionstatechange = () => {
        const state = (pc.current as any)?.connectionState;
        console.log('[WebRTC] Connection state changed:', state);
        if (state === 'connected') {
          setIsConnecting(false);
        } else if (state === 'failed' || state === 'closed') {
          console.warn('[WebRTC] Connection state:', state);
        }
      };

      (pc.current as any).oniceconnectionstatechange = () => {
        const iceState = (pc.current as any)?.iceConnectionState;
        console.log('[WebRTC] ICE connection state changed:', iceState);
        if (iceState === 'connected' || iceState === 'completed') {
          setIsConnecting(false);
        }
      };

      // Handle sending ICE candidates to the Web App
      pc.current.onicecandidate = async (event: any) => {
        if (event.candidate && channelRef.current) {
          const candidateData = event.candidate.toJSON ? event.candidate.toJSON() : event.candidate;
          console.log('[WebRTC] Sending ICE candidate:', candidateData.candidate?.slice(0, 50));
          channelRef.current.send({
            type: 'broadcast',
            event: 'webrtc-signaling',
            payload: {
              type: 'candidate',
              candidate: candidateData,
              sender: 'mobile'
            }
          });
        }
      };

      // 3. Listen for answers and ICE candidates from the Web App via Broadcast channel
      const signalingChannelName = `webrtc-incident-${incidentId}`;
      console.log(`[WebRTC] Subscribing to signaling channel: ${signalingChannelName}`);
      channelRef.current = supabase.channel(signalingChannelName)
        .on(
          'broadcast',
          { event: 'webrtc-signaling' },
          async (payload) => {
            const signal = payload.payload;
            
            // Only process signals from the responder
            if (signal.sender === 'responder') {
              console.log('[WebRTC] Received signal from responder:', signal.type);
              
              // Handle Ready (Web App joined late and missed the initial offer)
              if (signal.type === 'ready' && pc.current) {
                console.log('[WebRTC] Responder is ready, sending fresh offer...');
                const offer = await pc.current.createOffer({ iceRestart: true });
                await pc.current.setLocalDescription(offer);
                channelRef.current?.send({
                  type: 'broadcast',
                  event: 'webrtc-signaling',
                  payload: { type: 'offer', offer: offer, sender: 'mobile' }
                });
              }

              // Handle Answer
              if (signal.type === 'answer' && pc.current) {
                console.log('[WebRTC] Setting remote description from responder answer');
                const answerDesc = new RTCSessionDescription(signal.answer);
                await pc.current.setRemoteDescription(answerDesc);

                // Trickle ICE can arrive before the SDP answer. React Native WebRTC
                // rejects those candidates, so apply them once a remote description exists.
                const queuedCandidates = pendingRemoteCandidates.current.splice(0);
                for (const candidateData of queuedCandidates) {
                  await pc.current.addIceCandidate(new RTCIceCandidate(candidateData));
                }
              }
              
              // Handle ICE Candidates
              if (signal.type === 'candidate' && pc.current && signal.candidate) {
                try {
                  if (!pc.current.remoteDescription) {
                    console.log('[WebRTC] Queuing remote ICE candidate until answer is set');
                    pendingRemoteCandidates.current.push(signal.candidate);
                  } else {
                    console.log('[WebRTC] Adding remote ICE candidate');
                    await pc.current.addIceCandidate(new RTCIceCandidate(signal.candidate));
                  }
                } catch (candidateErr) {
                  console.warn('[WebRTC] Error adding ICE candidate:', candidateErr);
                }
              }
            }
          }
        )
        .subscribe(async (status) => {
          console.log('[WebRTC] Supabase signaling subscription status:', status);
          if (status === 'SUBSCRIBED') {
            // 4. Create and send the Offer to the Web App ONLY AFTER subscribed
            const offer = await pc.current!.createOffer({});
            await pc.current!.setLocalDescription(offer);

            console.log('[WebRTC] Broadcast initial offer to responder');
            channelRef.current.send({
              type: 'broadcast',
              event: 'webrtc-signaling',
              payload: {
                type: 'offer',
                offer: offer,
                sender: 'mobile'
              }
            });
          }
        });

    } catch (err) {
      console.error('WebRTC Error:', err);
      Alert.alert('Call Failed', 'Unable to start the video stream.');
      navigation.goBack();
    }
  };

  const endCall = async () => {
    cleanupCall();
    navigation.goBack();
  };

  const flipCamera = () => {
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (!videoTrack) return;

    try {
      videoTrack._switchCamera();
      setIsFrontCamera(current => !current);
    } catch (err) {
      console.warn('[WebRTC] Could not switch camera:', err);
      Alert.alert('Camera unavailable', 'Unable to switch cameras on this device.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.videoContainer}>
        {/* Use a remote surface only when the responder actually sends video. */}
        {remoteStream && hasRemoteVideo ? (
          <RTCView
            streamURL={remoteStream.toURL()}
            style={styles.remoteVideo}
            objectFit="cover"
            zOrder={0}
          />
        ) : localStream ? (
          <RTCView
            streamURL={localStream.toURL()}
            style={styles.remoteVideo}
            objectFit="cover"
            mirror={isFrontCamera}
            zOrder={0}
          />
        ) : (
          <View style={styles.connectingContainer}>
            <ActivityIndicator size="large" color="#ffffff" />
            <Text style={styles.connectingText}>Starting camera...</Text>
          </View>
        )}

        {/* Avoid overlapping Android video surfaces unless remote video exists. */}
        {localStream && hasRemoteVideo && (
          <View style={styles.localVideoContainer}>
            <RTCView
              streamURL={localStream.toURL()}
              style={styles.localVideo}
              objectFit="cover"
              mirror={isFrontCamera}
              zOrder={1}
            />
          </View>
        )}

        {localStream && !hasRemoteVideo && (
          <View style={styles.callStatus} pointerEvents="none">
            {isConnecting ? (
              <>
                <ActivityIndicator size="small" color="#ffffff" />
                <Text style={styles.callStatusText}>Waiting for responder to join...</Text>
              </>
            ) : (
              <>
                <Text style={styles.connectedText}>Responder connected</Text>
                <Text style={styles.connectedSubtext}>Your live video and audio are being shared.</Text>
              </>
            )}
          </View>
        )}
      </View>

      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.secondaryControlButton}
          onPress={flipCamera}
          disabled={!localStream}
          accessibilityRole="button"
          accessibilityLabel="Flip camera"
        >
          <SwitchCamera size={28} color="#ffffff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.endCallButton} onPress={endCall}>
          <PhoneOff size={32} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  videoContainer: {
    flex: 1,
    position: 'relative',
  },
  remoteVideo: {
    flex: 1,
  },
  localVideoContainer: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 100,
    height: 150,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#ffffff',
    elevation: 5,
  },
  localVideo: {
    flex: 1,
  },
  connectingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectingText: {
    color: '#ffffff',
    marginTop: 16,
    fontSize: 16,
  },
  connectedText: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '600',
  },
  connectedSubtext: {
    color: '#d1d5db',
    marginTop: 8,
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  callStatus: {
    position: 'absolute',
    top: 24,
    left: 20,
    right: 20,
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  callStatusText: {
    color: '#ffffff',
    marginTop: 8,
    fontSize: 15,
  },
  controls: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
  },
  secondaryControlButton: {
    backgroundColor: 'rgba(55, 65, 81, 0.9)',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
  },
  endCallButton: {
    backgroundColor: '#dc2626',
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
  },
});
