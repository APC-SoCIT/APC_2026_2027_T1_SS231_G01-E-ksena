import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Camera, CameraType, CameraView } from 'expo-camera';
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
import { uploadIncidentVideo } from '../../services/videoUpload';
import { supabase } from '../../services/supabaseClient';

type VideoCameraScreenNavigationProp = StackNavigationProp<MainStackParamList, 'MainTabs'>;

const VideoCameraScreen: React.FC = () => {
  const navigation = useNavigation<VideoCameraScreenNavigationProp>();
  const { state } = useAuth();
  const cameraRef = useRef<CameraView>(null);
  const recordingPromiseRef = useRef<Promise<any> | null>(null);

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [cameraType, setCameraType] = useState<CameraType>('back');
  const [flash, setFlash] = useState<'off' | 'on'>('off');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentVideoUri, setCurrentVideoUri] = useState<string | null>(null);
  const [showBucketModal, setShowBucketModal] = useState(false);
  const [bucketVideos, setBucketVideos] = useState<Array<{name:string; path:string; publicUrl?:string}>>([]);
  const [loadingBucket, setLoadingBucket] = useState(false);

  useEffect(() => {
    requestCameraPermission();
  }, []);

  const requestCameraPermission = async () => {
    try {
      const { status: cameraStatus } = await Camera.requestCameraPermissionsAsync();
      const { status: micStatus } = await Camera.requestMicrophonePermissionsAsync();

      const granted = cameraStatus === 'granted' && micStatus === 'granted';
      setHasPermission(granted);

      if (!granted) {
        Alert.alert(
          'Camera Permission Required',
          'Please enable camera and microphone access to record emergency videos with audio.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error requesting camera permission:', error);
      setHasPermission(false);
    }
  };

  const toggleCameraType = () => {
    setCameraType(current => (current === 'back' ? 'front' : 'back'));
  };

  const toggleFlash = () => {
    setFlash(prev => (prev === 'off' ? 'on' : 'off'));
  };

  const fetchBucketVideos = async () => {
    try {
      setLoadingBucket(true);
      const { data, error } = await supabase.storage.from('incident-videos').list('', { limit: 100 });
      
      console.log('Bucket list response:', { data, error });
      
      if (error) {
        console.warn('Failed to list bucket files', error);
        Alert.alert('Error', `Failed to load bucket videos: ${error.message}`);
        setLoadingBucket(false);
        return;
      }

      if (!data || data.length === 0) {
        console.warn('Bucket list returned empty - likely RLS policy. Using hardcoded test URL.');
        // Fallback: hardcode one test video from the bucket
        // Replace with one of your actual filenames from Supabase dashboard
        const testVideoName = 'ssstik.io_17702091174511.mp4'; // Change this to your actual file
        const { data: publicData } = supabase.storage.from('incident-videos').getPublicUrl(testVideoName);
        
        setBucketVideos([{ 
          name: testVideoName, 
          path: testVideoName, 
          publicUrl: publicData?.publicUrl ?? null 
        }]);
        setLoadingBucket(false);
        return;
      }

      // For public bucket, use getPublicUrl (simpler than signed URLs)
      const mapped = (data || []).map(f => {
        const { data: publicData } = supabase.storage.from('incident-videos').getPublicUrl(f.name);
        console.log(`Public URL for ${f.name}:`, publicData?.publicUrl);
        return { name: f.name, path: f.name, publicUrl: publicData?.publicUrl ?? null };
      });

      console.log('Mapped videos:', mapped);
      setBucketVideos(mapped);
    } catch (err) {
      console.error('Error fetching bucket videos', err);
      Alert.alert('Error', `Failed to load bucket videos: ${String(err)}`);
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
      if (!videoUrl) return Alert.alert('Error', 'Video URL missing');

      const { latitude, longitude, address } = state.location;
      if (!latitude || !longitude) return Alert.alert('Location Error', 'Unable to get your location.');

      const userPhoneNumber: string = state.auth.user?.phone ? String(state.auth.user.phone) : 'unknown';

      const result = await sendVideoReport(videoUrl, { latitude, longitude, address: address ?? undefined }, userPhoneNumber, videoUrl);

      if (result.success) {
        const responderStart = result.report.responderBase
          ? { latitude: result.report.responderBase.latitude, longitude: result.report.responderBase.longitude }
          : { latitude: latitude + 0.01, longitude: longitude - 0.01 };

        setPendingResponderRoute({
          incidentId: result.report.id,
          responderStart,
          userLocation: { latitude, longitude, address: address ?? undefined },
          dispatcherName: result.report.assignedDispatcher?.name || 'Dispatcher',
          dispatcherPhone: result.report.assignedDispatcher?.phone,
          responderBase: result.report.responderBase,
        });

        Alert.alert('Report Sent', result.message, [{ text: 'OK', onPress: () => navigation.navigate('MainTabs' as any) }]);
      } else {
        Alert.alert('Report Failed', result.message);
      }
    } catch (err) {
      console.error('Use bucket video error', err);
      Alert.alert('Error', 'Failed to use selected video.');
    }
  };

  const startRecording = async () => {
    if (!cameraRef.current) return;

    try {
      setIsRecording(true);
      setIsAnalyzing(true);

      // Start real video recording using Expo CameraView.
      // We DON'T await here; instead we keep the promise and stop it later.
      recordingPromiseRef.current = cameraRef.current
        .recordAsync({
          maxDuration: 30,
          quality: '1080p',
        })
        .then(recording => {
          const uri = recording?.uri;
          setCurrentVideoUri(uri || null);
          return handleRecordingComplete(uri);
        })
        .catch(error => {
          const errorMessage = error instanceof Error ? error.message : String(error);

          if (errorMessage.includes('Recording was stopped before any data could be produced')) {
            console.warn('Video recording failed to start properly:', errorMessage);
            Alert.alert(
              'Recording Issue',
              'Your device stopped the video recording before it could start. We will still send the emergency report without video.'
            );
          } else if (!errorMessage.includes('keep awake') && !errorMessage.includes('keepAwake')) {
            console.warn('Error during recording:', errorMessage);
            Alert.alert('Recording Error', 'Video recording failed. We will still send the emergency report.');
          } else {
            console.warn('Keep-awake warning (harmless):', errorMessage);
          }

          setIsRecording(false);
          setIsAnalyzing(false);

          // Fallback: still send an incident report without video
          handleRecordingComplete(null);
        });
    } catch (error) {
      // Suppress known camera warnings and handle other errors gracefully
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('Recording was stopped before any data could be produced')) {
        console.warn('Video recording failed to start properly:', errorMessage);
        Alert.alert(
          'Recording Issue',
          'Your device stopped the video recording before it could start. We will still send the emergency report without video.'
        );
      } else if (!errorMessage.includes('keep awake') && !errorMessage.includes('keepAwake')) {
        console.warn('Error starting recording:', errorMessage);
        Alert.alert('Recording Error', 'Failed to start recording. Please try again.');
      } else {
        console.warn('Keep-awake warning (harmless):', errorMessage);
      }

      setIsRecording(false);
      setIsAnalyzing(false);
    }
  };

  const stopRecording = async () => {
    // Stop the recording; startRecording's promise handler will continue the flow
    try {
      if (cameraRef.current && isRecording) {
        cameraRef.current.stopRecording();
      }
    } catch (error) {
      console.error('Error stopping recording:', error);
    }
  };

  const handleRecordingComplete = async (videoUri?: string | null) => {
    try {
      setIsRecording(false);
      setIsAnalyzing(false);

      const { latitude, longitude, address } = state.location;

      if (!latitude || !longitude) {
        Alert.alert('Location Error', 'Unable to get your location. Please try again.');
        return;
      }

      const userId = state.auth.user?.id || 'anonymous';
      const userPhoneNumber: string = state.auth.user?.phone ? String(state.auth.user.phone) : 'unknown';

      let videoUrl: string | undefined;
      if (videoUri) {
        try {
          videoUrl = await uploadIncidentVideo(videoUri, userId);
        } catch (e) {
          console.warn('Video upload failed, falling back to mock URL:', e);
          videoUrl = 'mock://video';
        }
      } else {
        // No video file (recording failed) – proceed with a mock URL
        videoUrl = 'mock://video';
      }

      const result = await sendVideoReport(
        videoUri || 'mock://no-video',
        { latitude, longitude, address: address ?? undefined },
        userPhoneNumber,
        videoUrl
      );

      if (result.success) {
        const responderStart = result.report.responderBase
          ? {
              latitude: result.report.responderBase.latitude,
              longitude: result.report.responderBase.longitude,
            }
          : {
              latitude: latitude + 0.01,
              longitude: longitude - 0.01,
            };

        setPendingResponderRoute({
          incidentId: result.report.id,
          responderStart,
          userLocation: { latitude, longitude, address: address ?? undefined },
          dispatcherName: result.report.assignedDispatcher?.name || 'Dispatcher',
          dispatcherPhone: result.report.assignedDispatcher?.phone,
          responderBase: result.report.responderBase,
        });

        Alert.alert(
          'Report Sent',
          result.message,
          [
            {
              text: 'OK',
              onPress: () => {
                navigation.navigate('MainTabs' as any);
              },
            },
          ]
        );
      } else {
        Alert.alert('Report Failed', result.message);
      }
    } catch (error) {
      console.error('Error stopping recording:', error);
      Alert.alert('Error', 'Failed to process video. Please try again.');
    }
  };

  const goBack = () => {
    navigation.goBack();
  };

  if (hasPermission === null) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Requesting camera permission...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (hasPermission === false) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Camera access denied</Text>
          <TouchableOpacity style={styles.retryButton} onPress={requestCameraPermission}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={goBack}>
          <ArrowLeft size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Emergency Camera</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconButton} onPress={toggleFlash}>
            <Zap size={22} color={flash === 'on' ? '#fbbf24' : '#ffffff'} />
          </TouchableOpacity>
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
          // Use string flash values supported by CameraView and enableTorch for continuous light
          flash={flash}
          enableTorch={flash === 'on'}
        >
          {isRecording && (
            <View style={styles.recordingIndicator}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingText}>RECORDING</Text>
            </View>
          )}

          {isAnalyzing && (
            <View style={styles.aiOverlay}>
              <View style={styles.aiAlert}>
                <Text style={styles.aiAlertText}>Analyzing...</Text>
                <Text style={styles.aiSubText}>
                  AI is analyzing the video and finding the best responder
                </Text>
              </View>
            </View>
          )}
        </CameraView>
      </View>

      <View style={styles.controlsContainer}>
        <TouchableOpacity
          style={[styles.recordButton, isRecording && styles.recordButtonActive]}
          onPress={isRecording ? stopRecording : startRecording}
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
          {isRecording ? 'Tap to stop recording' : 'Tap to start emergency recording'}
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
            bucketVideos.length === 0 ? (
              <View style={{flex:1,justifyContent:'center',alignItems:'center'}}>
                <Text style={{color:'#fff', opacity:0.8}}>No videos found in bucket.</Text>
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
            )
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#ffffff',
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  errorText: {
    color: '#ffffff',
    fontSize: 18,
    marginBottom: 20,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    padding: 6,
  },
  cameraContainer: {
    flex: 1,
    margin: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  camera: {
    flex: 1,
  },
  aiOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
  },
  aiAlert: {
    backgroundColor: 'rgba(220, 38, 38, 0.9)',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  aiAlertText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  aiSubText: {
    color: '#ffffff',
    fontSize: 14,
    opacity: 0.9,
    textAlign: 'center',
  },
  recordingIndicator: {
    position: 'absolute',
    top: 20,
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(220, 38, 38, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ffffff',
    marginRight: 8,
  },
  recordingText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  controlsContainer: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  recordButtonActive: {
    backgroundColor: '#ef4444',
  },
  instructionText: {
    color: '#ffffff',
    fontSize: 16,
    textAlign: 'center',
    opacity: 0.9,
  },
  bucketButton: {
    position: 'absolute',
    right: 24,
    top: -10,
    backgroundColor: '#374151',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  bucketButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});

export default VideoCameraScreen;


