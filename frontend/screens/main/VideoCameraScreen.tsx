import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { ArrowLeft, RotateCcw, Video as VideoIcon, VideoOff } from 'lucide-react-native';
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
import { sendVideoReport } from '../../services/ReportService';
import { supabase } from '../../services/supabaseClient';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';

type VideoCameraScreenNavigationProp = StackNavigationProp<MainStackParamList, 'MainTabs'>;

const VideoCameraScreen: React.FC = () => {
  const navigation = useNavigation<VideoCameraScreenNavigationProp>();
  const { state } = useAuth();
  
  const cameraRef = useRef<CameraView>(null);

  const [camPermission, requestCam] = useCameraPermissions();
  const [micPermission, requestMic] = useMicrophonePermissions();

  const [isRecording, setIsRecording] = useState(false);
  const [cameraType, setCameraType] = useState<'back' | 'front'>('back');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const [showBucketModal, setShowBucketModal] = useState(false);
  const [bucketVideos, setBucketVideos] = useState<Array<{name:string; path:string; publicUrl?:string}>>([]);
  const [loadingBucket, setLoadingBucket] = useState(false);

  useEffect(() => {
    if (!camPermission?.granted) requestCam();
    if (!micPermission?.granted) requestMic();
  }, [camPermission, micPermission]);

  const toggleCameraType = () => {
    setCameraType(current => (current === 'back' ? 'front' : 'back'));
  };

  const startEmergencyRecording = async () => {
    if (!cameraRef.current) return;
    
    try {
      setIsRecording(true);
      console.log('[FRONTEND] Starting 5-second video recording...');
      
      // Stop recording automatically after 5 seconds
      setTimeout(() => {
        if (cameraRef.current) {
          cameraRef.current.stopRecording();
        }
      }, 5000);

      const video = await cameraRef.current.recordAsync();
      
      setIsRecording(false);
      setIsAnalyzing(true);
      console.log('[FRONTEND] Recording finished. Uploading to Supabase...', video?.uri);

      if (!video?.uri) {
        throw new Error('No video URI returned from camera');
      }

      // 1. Upload to Supabase bucket "incident-videos"
      const fileName = `emergency_${Date.now()}.mp4`;
      
      const formData = new FormData();
      formData.append('file', {
        uri: video.uri,
        name: fileName,
        type: 'video/mp4'
      } as any);

      const { data, error } = await supabase.storage.from('incident-videos').upload(fileName, formData, {
        contentType: 'multipart/form-data',
      });

      if (error) {
         throw new Error(`Supabase upload error: ${error.message}`);
      }

      // 2. Get Public URL
      const { data: urlData } = supabase.storage.from('incident-videos').getPublicUrl(fileName);
      const publicUrl = urlData.publicUrl;
      console.log('[FRONTEND] Upload complete! Public URL:', publicUrl);

      // 3. Create Incident in Database (Backend will call AI Microservice with this URL)
      const { latitude, longitude, address } = state.location;
      if (!latitude || !longitude) throw new Error('Location is missing');
      
      const userPhoneNumber = state.auth.user?.phone ? String(state.auth.user.phone) : 'unknown';
      
      const result = await sendVideoReport(video.uri, { latitude, longitude, address: address ?? undefined }, userPhoneNumber, publicUrl);
      
      setIsAnalyzing(false);

      if (!result.success || !result.report?.id) {
         throw new Error('Failed to create incident on server');
      }
      
      Alert.alert('Emergency Reported', 'Your video was successfully analyzed and responders are notified!', [
        { text: 'OK', onPress: () => navigation.navigate('MainTabs' as any) }
      ]);
      
    } catch (err) {
       console.error('Recording/Upload Error:', err);
       setIsRecording(false);
       setIsAnalyzing(false);
       Alert.alert('Emergency Failed', String(err));
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

  if (!camPermission || !micPermission) {
    return (
       <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
           <ActivityIndicator size="large" color="#dc2626" />
        </View>
       </SafeAreaView>
    );
  }

  if (!camPermission.granted || !micPermission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Camera and Microphone access denied</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => { requestCam(); requestMic(); }}>
            <Text style={styles.retryButtonText}>Grant Permissions</Text>
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
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing={cameraType}
          mode="video"
        />

        {isRecording && (
          <View style={styles.recordingIndicator}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>RECORDING (5s)</Text>
          </View>
        )}

        {isAnalyzing && (
          <View style={styles.aiOverlay}>
            <View style={styles.aiAlert}>
              <ActivityIndicator size="large" color="#ffffff" />
              <Text style={styles.aiAlertText}>Analyzing...</Text>
              <Text style={styles.aiSubText}>
                AI is verifying the emergency
              </Text>
            </View>
          </View>
        )}
      </View>

      <View style={styles.controlsContainer}>
        <TouchableOpacity
          style={[styles.recordButton, isRecording && styles.recordButtonActive]}
          onPress={startEmergencyRecording}
          disabled={isRecording || isAnalyzing}
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
          {isRecording ? 'Recording emergency clip...' : 'Tap to START RECORDING'}
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
  aiOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(220, 38, 38, 0.7)' },
  aiAlert: { backgroundColor: 'rgba(0, 0, 0, 0.8)', paddingHorizontal: 30, paddingVertical: 24, borderRadius: 16, alignItems: 'center' },
  aiAlertText: { color: '#ffffff', fontSize: 20, fontWeight: 'bold', marginTop: 12, marginBottom: 4 },
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
