import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { getDirections } from '../../services/mapbox';
import { Phone, MessageSquare, Video, Zap } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { consumePendingResponderRoute } from '../../services/ReportService';
import Constants from 'expo-constants';
import * as SMS from 'expo-sms';
import * as Location from 'expo-location';
import { supabase } from '../../services/supabaseClient';

interface ResponderData {
  incidentId: string;
  userLocation: { latitude: number; longitude: number; address?: string };
  responderLocation: { latitude: number; longitude: number };
  responderBase?: { latitude: number; longitude: number; name?: string; address?: string | null };
  dispatcherName: string;
  dispatcherPhone?: string | null;
  serviceType?: string;
}

const HomeScreen: React.FC = () => {
  const navigation = useNavigation();
  const { state, setLocation } = useAuth();

  const [responderData, setResponderData] = useState<ResponderData | null>(null);
  const dispatchChannelRef = useRef<any>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<Array<[number, number]> | null>(null);
  const [distance, setDistance] = useState(0);
  const [eta, setETA] = useState('');
  const [mapCenter, setMapCenter] = useState<[number, number]>([
    state.location.longitude || 121.0215128,
    state.location.latitude || 14.5310248,
  ]);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Denied', 'Allow location access to use this app properly.');
          return;
        }

        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

        const { latitude, longitude } = location.coords;
        const addressResponse = await Location.reverseGeocodeAsync({ latitude, longitude });
        const addressEntry = addressResponse[0];
        const address = addressEntry
          ? `${addressEntry.street || ''} ${addressEntry.city || ''} ${addressEntry.region || ''}`.trim()
          : 'Unknown Location';

        setLocation(latitude, longitude, address);
        setMapCenter([longitude, latitude]);
      } catch (error) {
        console.error('Location Error:', error);
      }
    })();
  }, []);

  // Fetch directions when responder data is set
  useEffect(() => {
    if (responderData) {
      const { userLocation, responderLocation } = responderData;

      // Calculate straight-line distance
      const R = 6371;
      const dLat = ((responderLocation.latitude - userLocation.latitude) * Math.PI) / 180;
      const dLon = ((responderLocation.longitude - userLocation.longitude) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((userLocation.latitude * Math.PI) / 180) *
        Math.cos((responderLocation.latitude * Math.PI) / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      setDistance(distKm);
      const etaMinutes = Math.round((distKm / 40) * 60);
      setETA(etaMinutes > 0 ? `${etaMinutes} min` : 'Arriving soon');

      // Center map between user and responder
      const centerLng = (userLocation.longitude + responderLocation.longitude) / 2;
      const centerLat = (userLocation.latitude + responderLocation.latitude) / 2;
      setMapCenter([centerLng, centerLat]);

      // Fetch real road route
      getDirections(
        userLocation.longitude, userLocation.latitude,
        responderLocation.longitude, responderLocation.latitude
      ).then(coords => {
        if (coords) setRouteCoordinates(coords);
      });
    } else {
      setMapCenter([
        state.location.longitude || 121.0215128,
        state.location.latitude || 14.5310248,
      ]);
      setRouteCoordinates(null);
    }
  }, [responderData, state.location]);

  // Listen for incoming responder route when screen focuses
  useEffect(() => {
    const unsubscribe = (navigation as any).addListener?.('focus', () => {
      const pending = consumePendingResponderRoute();
      if (pending) {
        setResponderData({
          incidentId: pending.incidentId,
          userLocation: pending.userLocation,
          responderLocation: pending.responderStart,
          responderBase: pending.responderBase,
          dispatcherName: pending.dispatcherName || 'Emergency Responder',
          dispatcherPhone: pending.dispatcherPhone,
          serviceType: pending.serviceType,
        });
      }
    });
    return () => unsubscribe?.();
  }, [navigation]);

  // Listen for dispatch 'resolved' status from the web responder clicking "Done"
  useEffect(() => {
    if (!responderData?.incidentId) {
      // Clean up any old channel if incident is cleared
      if (dispatchChannelRef.current) {
        supabase.removeChannel(dispatchChannelRef.current);
        dispatchChannelRef.current = null;
      }
      return;
    }

    const incidentId = responderData.incidentId;

    // Subscribe to changes on the dispatch table for this specific incident
    const channel = supabase
      .channel(`dispatch-resolved-${incidentId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'dispatch',
          filter: `incident_id=eq.${incidentId}`,
        },
        (payload) => {
          if (payload.new?.status === 'resolved') {
            Alert.alert(
              '✅ Dispatch Has Arrived!',
              'The emergency responder has arrived at your location and marked the incident as resolved.',
              [
                {
                  text: 'OK',
                  onPress: () => {
                    // Clean up and reset to normal home screen
                    if (dispatchChannelRef.current) {
                      supabase.removeChannel(dispatchChannelRef.current);
                      dispatchChannelRef.current = null;
                    }
                    setResponderData(null);
                  },
                },
              ]
            );
          }
        }
      )
      .subscribe();

    dispatchChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      dispatchChannelRef.current = null;
    };
  }, [responderData?.incidentId]);

  const handleEmergencyReport = () => {
    (navigation as any).navigate('Video');
  };

  const handleSMSFallback = async () => {
    try {
      const isAvailable = await SMS.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('SMS Not Available', 'SMS is not available on this device.');
        return;
      }

      const { latitude, longitude } = state.location;
      if (latitude && longitude) {
        const message = `EMERGENCY: I need help at ${latitude}, ${longitude}. Please send assistance immediately. Incident #${responderData?.incidentId}`;
        const smsNumber = responderData?.dispatcherPhone || '+12345678901';
        await SMS.sendSMSAsync([smsNumber], message);
      }
    } catch (error) {
      console.error('Error sending SMS:', error);
    }
  };

  const handleCallResponder = () => {
    if (responderData?.dispatcherPhone) {
      (navigation as any).navigate('CallScreen', {
        incidentId: responderData.incidentId,
        responderPhone: responderData.dispatcherPhone
      });
    }
  };

  const userCoordinate: [number, number] = [
    responderData?.userLocation.longitude || state.location.longitude || 121.0215128,
    responderData?.userLocation.latitude || state.location.latitude || 14.5310248,
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <MapView
        style={styles.map}
        provider="google"
        showsUserLocation={true}
        showsMyLocationButton={true}
        region={{
          latitude: mapCenter[1],
          longitude: mapCenter[0],
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {/* User location marker */}
        <Marker coordinate={{ latitude: userCoordinate[1], longitude: userCoordinate[0] }}>
          <View style={styles.userMarker}>
            <View style={styles.markerDot} />
          </View>
        </Marker>

        {/* Responder markers and route */}
        {responderData && (
          <>
            <Marker
              coordinate={{
                latitude: responderData.responderLocation.latitude,
                longitude: responderData.responderLocation.longitude,
              }}
            >
              <View style={styles.responderMarker}>
                <View style={styles.markerDot} />
              </View>
            </Marker>

            {responderData.responderBase && (
              <Marker
                coordinate={{
                  latitude: responderData.responderBase.latitude,
                  longitude: responderData.responderBase.longitude,
                }}
              >
                <View style={styles.baseMarker}>
                  <View style={styles.markerDot} />
                </View>
              </Marker>
            )}

            <Polyline
              coordinates={
                routeCoordinates
                  ? routeCoordinates.map(c => ({ latitude: c[1], longitude: c[0] }))
                  : [
                    {
                      latitude: responderData.userLocation.latitude,
                      longitude: responderData.userLocation.longitude,
                    },
                    {
                      latitude: responderData.responderLocation.latitude,
                      longitude: responderData.responderLocation.longitude,
                    },
                  ]
              }
              strokeColor="#3b82f6"
              strokeWidth={4}
            />
          </>
        )}
      </MapView>

      {/* Overlay Controls */}
      <View style={styles.controlsOverlay}>
        {/* Emergency Button */}
        <TouchableOpacity style={styles.emergencyButton} onPress={handleEmergencyReport}>
          <Video size={24} color="#ffffff" />
          <Text style={styles.emergencyButtonText}>Send Emergency Report</Text>
        </TouchableOpacity>

        {/* Responder Info Panel */}
        {responderData && (
          <View style={styles.responderPanel}>
            <View style={styles.responderHeader}>
              <View>
                <Text style={styles.responderName}>{responderData.dispatcherName}</Text>
                <Text style={styles.incidentId}>Incident #{responderData.incidentId.substring(0, 8)}</Text>
                {responderData.serviceType && (
                  <Text style={styles.serviceType}>{responderData.serviceType}</Text>
                )}
              </View>
            </View>

            <View style={styles.distanceRow}>
              <View style={styles.distanceItem}>
                <Text style={styles.distanceLabel}>Distance</Text>
                <Text style={styles.distanceValue}>{distance.toFixed(2)} km</Text>
              </View>
              <View style={styles.distanceItem}>
                <Text style={styles.distanceLabel}>ETA</Text>
                <Text style={styles.distanceValue}>{eta}</Text>
              </View>
            </View>

            <View style={styles.actionButtons}>
              <TouchableOpacity style={styles.callButton} onPress={handleCallResponder}>
                <Phone size={18} color="#ffffff" />
                <Text style={styles.buttonText}>Call</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.callButton, styles.messageButton]} onPress={handleSMSFallback}>
                <MessageSquare size={18} color="#ffffff" />
                <Text style={styles.buttonText}>Message</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* No Active Incident */}
        {!responderData && (
          <View style={styles.noIncidentPanel}>
            <Zap size={32} color="#fbbf24" />
            <Text style={styles.noIncidentText}>No active emergency</Text>
            <Text style={styles.noIncidentSubtext}>Tap above to send a video report</Text>

            <View style={styles.offlineDivider} />

            <TouchableOpacity style={styles.offlineSmsButton} onPress={handleSMSFallback}>
              <MessageSquare size={20} color="#dc2626" />
              <Text style={styles.offlineSmsText}>Offline? Send SMS Alert</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  map: { flex: 1 },
  userMarker: { backgroundColor: '#3b82f6', borderRadius: 8, padding: 4 },
  responderMarker: { backgroundColor: '#ef4444', borderRadius: 8, padding: 4 },
  baseMarker: { backgroundColor: '#fbbf24', borderRadius: 8, padding: 4 },
  markerDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ffffff' },
  controlsOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingBottom: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  emergencyButton: {
    backgroundColor: '#dc2626', borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 20,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    marginBottom: 12, elevation: 8,
  },
  emergencyButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold', marginLeft: 8 },
  responderPanel: {
    backgroundColor: '#ffffff', borderRadius: 16, padding: 16, elevation: 5,
  },
  responderHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  responderName: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
  incidentId: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  serviceType: { fontSize: 14, color: '#dc2626', fontWeight: 'bold', marginTop: 4 },
  distanceRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  distanceItem: { flex: 1, alignItems: 'center' },
  distanceLabel: { fontSize: 12, color: '#6b7280', marginBottom: 4, fontWeight: '600' },
  distanceValue: { fontSize: 18, fontWeight: 'bold', color: '#ef4444' },
  actionButtons: { flexDirection: 'row', gap: 12 },
  callButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#ef4444', paddingVertical: 10, borderRadius: 8, gap: 6,
  },
  messageButton: { backgroundColor: '#3b82f6' },
  buttonText: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
  noIncidentPanel: {
    backgroundColor: '#ffffff', borderRadius: 16, padding: 24,
    alignItems: 'center', elevation: 5,
  },
  noIncidentText: { fontSize: 16, fontWeight: 'bold', color: '#111827', marginTop: 8 },
  noIncidentSubtext: { fontSize: 13, color: '#6b7280', marginTop: 4 },
  offlineDivider: { height: 1, backgroundColor: '#e5e7eb', width: '100%', marginVertical: 16 },
  offlineSmsButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12,
    borderWidth: 1, borderColor: '#dc2626', width: '100%', gap: 8
  },
  offlineSmsText: { color: '#dc2626', fontSize: 14, fontWeight: 'bold' },
});

export default HomeScreen;