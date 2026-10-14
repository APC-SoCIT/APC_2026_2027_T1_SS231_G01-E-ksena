import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { RTCPeerConnection, RTCIceCandidate, RTCSessionDescription, RTCView, mediaDevices, MediaStream } from 'react-native-webrtc';
import { PhoneOff } from 'lucide-react-native';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../context/AuthContext';

const configuration = {
  iceServers: [
    {
      urls: 'stun:stun.l.google.com:19302'
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
  
  const pc = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    startCall();
    
    return () => {
      endCall();
    };
  }, []);

  const startCall = async () => {
    try {
      // 1. Get local media stream
      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: { width: 640, height: 480, frameRate: 30, facingMode: 'user' }
      }) as MediaStream;
      
      setLocalStream(stream);

      // 2. Initialize Peer Connection with STUN and TURN
      pc.current = new RTCPeerConnection(configuration);

      // Add local tracks to PeerConnection
      stream.getTracks().forEach((track) => {
        pc.current?.addTrack(track, stream);
      });

      // Handle receiving remote stream
      pc.current.ontrack = (event: any) => {
        console.log('[WebRTC] Received remote stream track:', event.track?.kind);
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
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
              }
              
              // Handle ICE Candidates
              if (signal.type === 'candidate' && pc.current && signal.candidate) {
                try {
                  console.log('[WebRTC] Adding remote ICE candidate');
                  const candidate = new RTCIceCandidate(signal.candidate);
                  await pc.current.addIceCandidate(candidate);
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
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    if (pc.current) {
      pc.current.close();
    }
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.videoContainer}>
        {/* Remote Video (Responder) */}
        {remoteStream ? (
          <RTCView
            streamURL={remoteStream.toURL()}
            style={styles.remoteVideo}
            objectFit="cover"
          />
        ) : (
          <View style={styles.connectingContainer}>
            <ActivityIndicator size="large" color="#ffffff" />
            <Text style={styles.connectingText}>Waiting for responder to join...</Text>
          </View>
        )}

        {/* Local Video (Citizen) */}
        {localStream && (
          <View style={styles.localVideoContainer}>
            <RTCView
              streamURL={localStream.toURL()}
              style={styles.localVideo}
              objectFit="cover"
              zOrder={1}
            />
          </View>
        )}
      </View>

      <View style={styles.controls}>
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
  controls: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
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
