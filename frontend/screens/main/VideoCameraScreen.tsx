import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { ArrowLeft, RotateCcw, Video as VideoIcon, VideoOff } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
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
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);


  useEffect(() => {
    if (!camPermission?.granted) requestCam();
    if (!micPermission?.granted) requestMic();
  }, [camPermission, micPermission]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const toggleCameraType = () => {
    setCameraType(current => (current === 'back' ? 'front' : 'back'));
  };

  const toggleRecording = async () => {
    if (isRecording) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      cameraRef.current?.stopRecording();
    } else {
      try {
        const noticeSeen = await AsyncStorage.getItem('@eksena_ai_recording_notice_seen');
        if (!noticeSeen) {
          Alert.alert(
            'Automated AI Processing Notice',
            'Under Section 5 of the Privacy Policy and RA 10173 (Data Privacy Act), video recorded here is automatically analyzed by an AI system to classify emergency severity and dispatched to responders.\n\nDo you consent to proceed?',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Consent & Record',
                onPress: async () => {
                  await AsyncStorage.setItem('@eksena_ai_recording_notice_seen', 'true');
                  startEmergencyRecording();
                },
              },
            ]
          );
          return;
        }
      } catch (err) {
        console.warn('[VideoCameraScreen] Notice check error:', err);
      }

      startEmergencyRecording();
    }
  };

  const startEmergencyRecording = async () => {
    if (!cameraRef.current) return;
    
    try {
      setIsRecording(true);
      setElapsedSeconds(0);
      console.log('[FRONTEND] Starting video recording (10 seconds max)...');
      
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setElapsedSeconds(prev => {
          if (prev >= 10) {
            if (timerRef.current) clearInterval(timerRef.current);
            return 10;
          }
          return prev + 1;
        });
      }, 1000);

      const video = await cameraRef.current.recordAsync({ maxDuration: 10 });
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
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
      const userId = state.auth.user?.id;
      
      const result = await sendVideoReport(
        video.uri,
        { latitude, longitude, address: address ?? undefined },
        userPhoneNumber,
        publicUrl,
        undefined,
        userId
      );
      
      setIsAnalyzing(false);

      if (!result.success || !result.report?.id) {
         throw new Error(`[URL: ${process.env.EXPO_PUBLIC_API_BASE_URL}] Failed to create incident on server: ${result.message}`);
      }
      
      const rawResult = result.report?.description?.replace(/Emergency\s*null\s*incident/gi, '')?.trim();
      const aiResult = rawResult && rawResult !== 'Emergency Incident'
        ? rawResult
        : 'Emergency Incident (Responders Notified)';
      
      Alert.alert('Emergency Detected!', `AI Classification complete.\n\nClassified: ${aiResult}\n\nHelp is on the way!`, [
        { text: 'OK', onPress: () => navigation.navigate('MainTabs' as any) }
      ]);
      
    } catch (err) {
       if (timerRef.current) {
         clearInterval(timerRef.current);
         timerRef.current = null;
       }
       console.error('Recording/Upload Error:', err);
       setIsRecording(false);
       setIsAnalyzing(false);
       Alert.alert('Emergency Failed', String(err));
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
          videoQuality="480p"
          videoBitrate={1500000}
        />

        {isRecording && (
          <>
            <View style={styles.recordingIndicator}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingText}>
                REC {elapsedSeconds < 10 ? `00:0${elapsedSeconds}` : `00:${elapsedSeconds}`} / 00:10
              </Text>
            </View>

            <View style={styles.progressBarBackground}>
              <View style={[styles.progressBarFill, { width: `${Math.min(100, (elapsedSeconds / 10) * 100)}%` }]} />
            </View>
          </>
        )}

        {isAnalyzing && (
          <View style={styles.aiOverlay}>
            <View style={styles.aiAlert}>
              <ActivityIndicator size="large" color="#ffffff" />
              <Text style={styles.aiAlertText}>Protecting Privacy & Classifying...</Text>
              <Text style={styles.aiSubText}>
                Blurring faces and classifying emergency
              </Text>
            </View>
          </View>
        )}
      </View>

      <View style={styles.controlsContainer}>
        <TouchableOpacity
          style={[styles.recordButton, isRecording && styles.recordButtonActive]}
          onPress={toggleRecording}
          disabled={isAnalyzing}
        >
          {isRecording ? (
            <VideoOff size={32} color="#ffffff" />
          ) : (
            <VideoIcon size={32} color="#ffffff" />
          )}
        </TouchableOpacity>
        <Text style={styles.instructionText}>
          {isRecording
            ? `Recording clip... ${Math.max(0, 10 - elapsedSeconds)}s remaining`
            : 'Tap to START RECORDING (10s max)'}
        </Text>
      </View>
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
  recordingIndicator: { 
    position: 'absolute', 
    top: 16, 
    left: 16, 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: 'rgba(220, 38, 38, 0.95)', 
    paddingHorizontal: 14, 
    paddingVertical: 8, 
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ffffff', marginRight: 8 },
  recordingText: { color: '#ffffff', fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  progressBarBackground: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#dc2626',
  },
  controlsContainer: { padding: 20, alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.7)' },
  recordButton: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#dc2626', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  recordButtonActive: { backgroundColor: '#ef4444' },
  instructionText: { color: '#ffffff', fontSize: 16, textAlign: 'center', opacity: 0.9 },
});

export default VideoCameraScreen;
