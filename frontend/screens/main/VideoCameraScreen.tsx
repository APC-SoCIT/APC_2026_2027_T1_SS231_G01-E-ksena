import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { ArrowLeft, RotateCcw, Video as VideoIcon, VideoOff, Zap } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { MainStackParamList } from '../../navigation/MainStack';
import { sendVideoReport, setPendingResponderRoute } from '../../services/ReportService';
import { supabase } from '../../services/supabaseClient';
import {
  RTCPeerConnection,
  RTCView,
  mediaDevices,
  RTCIceCandidate,
  RTCSessionDescription,
  MediaStream,
} from 'react-native-webrtc';

type VideoCameraScreenNavigationProp = StackNavigationProp<MainStackParamList, 'MainTabs'>;

const VideoCameraScreen: React.FC = () => {
  const navigation = useNavigation<VideoCameraScreenNavigationProp>();
  const { state } = useAuth();
  
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<any>(null);

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [cameraType, setCameraType] = useState<'environment' | 'user'>('environment');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const [showBucketModal, setShowBucketModal] = useState(false);
  const [bucketVideos, setBucketVideos] = useState<Array<{name:string; path:string; publicUrl?:string}>>([]);
  const [loadingBucket, setLoadingBucket] = useState(false);

  useEffect(() => {
    startLocalStream();
    return () => {
      cleanupWebRTC();
    };
  }, [cameraType]);

  const startLocalStream = async () => {
    try {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      
      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: {
          facingMode: cameraType,
        },
      });
      setLocalStream(stream);
      setHasPermission(true);
    } catch (err) {
      console.error('Failed to get local stream', err);
      setHasPermission(false);
      Alert.alert('Camera Error', 'Could not access the camera or microphone');
    }
  };

  const cleanupWebRTC = () => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (channelRef.current) {
      channelRef.current.unsubscribe();
      channelRef.current = null;
    }
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
  };

  const stopRecording = () => {
    setIsRecording(false);
    setIsAnalyzing(false);
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (channelRef.current) {
      channelRef.current.unsubscribe();
      channelRef.current = null;
    }
    Alert.alert('Emergency Ended', 'Your live broadcast has been disconnected.', [
      { text: 'OK', onPress: () => navigation.navigate('MainTabs' as any) }
    ]);
  };

  const toggleCameraType = () => {
    setCameraType(current => (current === 'environment' ? 'user' : 'environment'));
  };

  const startEmergencyWebRTC = async () => {
    if (!localStream) return;
    
    setIsRecording(true);
    setIsAnalyzing(true);

    try {
      // 1. Create Incident in Database to get incidentId
      const { latitude, longitude, address } = state.location;
      if (!latitude || !longitude) throw new Error('Location is missing');
      
      const userPhoneNumber = state.auth.user?.phone ? String(state.auth.user.phone) : 'unknown';
      
      // Use "live://webrtc" as a placeholder video URL for the backend
      const result = await sendVideoReport('live://webrtc', { latitude, longitude, address: address ?? undefined }, userPhoneNumber, 'live://webrtc');
      
      if (!result.success || !result.report?.id) {
         throw new Error('Failed to create incident on server');
      }
      
      const incidentId = result.report.id;
      
      const responderStart = result.report.responderBase
          ? { latitude: result.report.responderBase.latitude, longitude: result.report.responderBase.longitude }
          : { latitude: latitude + 0.01, longitude: longitude - 0.01 };

      setPendingResponderRoute({
          incidentId: incidentId,
          responderStart,
          userLocation: { latitude, longitude, address: address ?? undefined },
          dispatcherName: result.report.assignedDispatcher?.name || 'Dispatcher',
          dispatcherPhone: result.report.assignedDispatcher?.phone,
          responderBase: result.report.responderBase,
      });

      // 2. Setup WebRTC Peer Connection
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });
      pcRef.current = pc;
      
      // Add local stream tracks to the connection
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });

      // 3. Connect to Supabase Channel
      const channel = supabase.channel(`webrtc-incident-${incidentId}`);
      channelRef.current = channel;
      
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          channel.send({
            type: 'broadcast',
            event: 'webrtc-signaling',
            payload: { type: 'candidate', candidate: event.candidate, sender: 'caller' }
          });
        }
      };
      
      channel.on('broadcast', { event: 'webrtc-signaling' }, async ({ payload }) => {
         if (payload.sender === 'caller') return; 
         
         if (payload.type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
            setIsAnalyzing(false); // Connected!
         }
         else if (payload.type === 'candidate' && payload.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
         }
      });
      
      channel.subscribe(async (status) => {
         if (status === 'SUBSCRIBED') {
            const offer = await pc.createOffer({});
            await pc.setLocalDescription(offer);
            
            channel.send({
              type: 'broadcast',
              event: 'webrtc-signaling',
              payload: { type: 'offer', offer: offer, sender: 'caller' }
            });
         }
      });
      
    } catch (err) {
       console.error('WebRTC Error:', err);
       Alert.alert('Connection Failed', String(err));
       stopRecording();
    }
  };

  const fetchBucketVideos = async () => {
    try {
      setLoadingBucket(true);
      const { data, error } = await supabase.storage.from('incident-videos').list('', { limit: 100 });
      if (error) return;
      if (!data || data.length === 0) return;

      const mapped = (data || []).map(f => {
        const { data: publicData } = supabase.storage.from('incident-videos').getPublicUrl(f.name);
        return { name: f.name, path: f.name, publicUrl: publicData?.publicUrl ?? null };
      });
      setBucketVideos(mapped);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingBucket(false);
    }
  };

  const openBucketModal = async () => {
    setShowBucketModal(true);
    await fetchBucketVideos();
  };

  const handleUseBucketVideo = async (videoUrl?: string) => {
    try {
      setShowBucketModal(false);
      if (!videoUrl) return;
      const { latitude, longitude, address } = state.location;
      if (!latitude || !longitude) return Alert.alert('Error', 'No location');
      const userPhone = state.auth.user?.phone ? String(state.auth.user.phone) : 'unknown';
      const result = await sendVideoReport(videoUrl, { latitude, longitude, address: address ?? undefined }, userPhone, videoUrl);
      if (result.success) {
        Alert.alert('Report Sent', 'Bucket video used successfully', [{ text: 'OK', onPress: () => navigation.navigate('MainTabs' as any) }]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (hasPermission === false) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Camera access denied</Text>
          <TouchableOpacity style={styles.retryButton} onPress={startLocalStream}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Emergency Broadcast</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconButton} onPress={toggleCameraType}>
            <RotateCcw size={22} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.cameraContainer}>
        {localStream ? (
          <RTCView
            streamURL={localStream.toURL()}
            style={styles.camera}
            objectFit="cover"
          />
        ) : (
          <View style={[styles.camera, { backgroundColor: '#222', justifyContent:'center', alignItems:'center' }]}>
             <ActivityIndicator size="large" color="#dc2626" />
          </View>
        )}

        {isRecording && (
          <View style={styles.recordingIndicator}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>LIVE</Text>
          </View>
        )}

        {isAnalyzing && (
          <View style={styles.aiOverlay}>
            <View style={styles.aiAlert}>
              <Text style={styles.aiAlertText}>Connecting...</Text>
              <Text style={styles.aiSubText}>
                Establishing secure video link to responder...
              </Text>
            </View>
          </View>
        )}
      </View>

      <View style={styles.controlsContainer}>
        <TouchableOpacity
          style={[styles.recordButton, isRecording && styles.recordButtonActive]}
          onPress={isRecording ? stopRecording : startEmergencyWebRTC}
        >
          {isRecording ? (
            <VideoOff size={32} color="#ffffff" />
          ) : (
            <VideoIcon size={32} color="#ffffff" />
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.bucketButton} onPress={openBucketModal}>
          <Text style={styles.bucketButtonText}>Pick</Text>
        </TouchableOpacity>
        <Text style={styles.instructionText}>
          {isRecording ? 'Tap to end broadcast' : 'Tap to START LIVE BROADCAST'}
        </Text>
      </View>

      <Modal visible={showBucketModal} animationType="slide" onRequestClose={() => setShowBucketModal(false)}>
        <SafeAreaView style={{flex:1, backgroundColor:'#000'}}>
          <View style={{padding:16, flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
            <Text style={{color:'#fff', fontSize:18}}>Select Bucket Video</Text>
            <TouchableOpacity onPress={() => setShowBucketModal(false)}>
              <Text style={{color:'#fff'}}>Close</Text>
            </TouchableOpacity>
          </View>
          {loadingBucket ? (
            <View style={{flex:1,justifyContent:'center',alignItems:'center'}}>
              <ActivityIndicator size="large" color="#fff" />
            </View>
          ) : (
             <FlatList
                data={bucketVideos}
                keyExtractor={item => item.path}
                contentContainerStyle={{padding:16}}
                renderItem={({item}) => (
                  <View style={{marginBottom:12, backgroundColor:'rgba(255,255,255,0.04)', padding:12, borderRadius:8}}>
                    <Text style={{color:'#fff', marginBottom:8}} numberOfLines={1}>{item.name}</Text>
                    <View style={{flexDirection:'row', justifyContent:'flex-end'}}>
                      <TouchableOpacity style={{paddingHorizontal:12, paddingVertical:8, backgroundColor:'#2563eb', borderRadius:6}} onPress={() => handleUseBucketVideo(item.publicUrl || undefined)}>
                        <Text style={{color:'#fff'}}>Use</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  errorText: { color: '#ffffff', fontSize: 18, marginBottom: 20, textAlign: 'center' },
  retryButton: { backgroundColor: '#dc2626', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  retryButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: 'rgba(0, 0, 0, 0.7)' },
  backButton: { padding: 8 },
  headerTitle: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },
  headerActions: { flexDirection: 'row', gap: 8 },
  iconButton: { padding: 6 },
  cameraContainer: { flex: 1, margin: 16, borderRadius: 12, overflow: 'hidden' },
  camera: { flex: 1 },
  aiOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(220, 38, 38, 0.3)' },
  aiAlert: { backgroundColor: 'rgba(220, 38, 38, 0.9)', paddingHorizontal: 20, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  aiAlertText: { color: '#ffffff', fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  aiSubText: { color: '#ffffff', fontSize: 14, opacity: 0.9, textAlign: 'center' },
  recordingIndicator: { position: 'absolute', top: 20, left: 20, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(220, 38, 38, 0.9)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ffffff', marginRight: 8 },
  recordingText: { color: '#ffffff', fontSize: 12, fontWeight: 'bold' },
  controlsContainer: { padding: 20, alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.7)' },
  recordButton: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#dc2626', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  recordButtonActive: { backgroundColor: '#ef4444' },
  instructionText: { color: '#ffffff', fontSize: 16, textAlign: 'center', opacity: 0.9 },
  bucketButton: { position: 'absolute', right: 24, top: -10, backgroundColor: '#374151', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  bucketButtonText: { color: '#fff', fontWeight: '600' },
});

export default VideoCameraScreen;
