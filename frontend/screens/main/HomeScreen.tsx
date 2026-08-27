import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapboxGL from '@rnmapbox/maps';
import { getDirections } from '../../services/mapbox';
import { Phone, MessageSquare, Video, Zap } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { consumePendingResponderRoute } from '../../services/ReportService';
import Constants from 'expo-constants';

const MAPBOX_TOKEN = (Constants.expoConfig as any)?.extra?.MAPBOX_TOKEN as string;
MapboxGL.setAccessToken(MAPBOX_TOKEN);

interface ResponderData {
  incidentId: string;
  userLocation: { latitude: number; longitude: number; address?: string };
  responderLocation: { latitude: number; longitude: number };
  responderBase?: { latitude: number; longitude: number; name?: string; address?: string | null };
  dispatcherName: string;
  dispatcherPhone?: string | null;
}

const HomeScreen: React.FC = () => {
  const navigation = useNavigation();
  const { state } = useAuth();

  const [responderData, setResponderData] = useState<ResponderData | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<Array<[number, number]> | null>(null);
  const [distance, setDistance] = useState(0);
  const [eta, setETA] = useState('');
  const [mapCenter, setMapCenter] = useState<[number, number]>([
    state.location.longitude || 121.0215128,
    state.location.latitude || 14.5310248,
  ]);

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
        });
      }
    });
    return () => unsubscribe?.();
  }, [navigation]);

  const handleEmergencyReport = () => {
    (navigation as any).navigate('Video');
  };

  const handleCallResponder = () => {
    if (responderData?.dispatcherPhone) {
      Alert.alert(
        'Call Dispatcher',
        `Call ${responderData.dispatcherName} at ${responderData.dispatcherPhone}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Call', onPress: () => Alert.alert('Info', 'Calling integration coming soon') },
        ]
      );
    }
  };

  const userCoordinate: [number, number] = [
    responderData?.userLocation.longitude || state.location.longitude || 121.0215128,
    responderData?.userLocation.latitude || state.location.latitude || 14.5310248,
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Mapbox Map */}
      <MapboxGL.MapView style={styles.map}>
        <MapboxGL.Camera
          centerCoordinate={mapCenter}
          zoomLevel={12}
          animationMode="flyTo"
          animationDuration={500}
        />

        {/* User location marker */}
        <MapboxGL.PointAnnotation id="user-location" coordinate={userCoordinate}>
          <View style={styles.userMarker}>
            <View style={styles.markerDot} />
          </View>
        </MapboxGL.PointAnnotation>

        {/* Responder markers and route */}
        {responderData && (
          <>
            <MapboxGL.PointAnnotation
              id="responder-location"
              coordinate={[
                responderData.responderLocation.longitude,
                responderData.responderLocation.latitude,
              ]}
            >
              <View style={styles.responderMarker}>
                <View style={styles.markerDot} />
              </View>
            </MapboxGL.PointAnnotation>

            {responderData.responderBase && (
              <MapboxGL.PointAnnotation
                id="responder-base"
                coordinate={[
                  responderData.responderBase.longitude,
                  responderData.responderBase.latitude,
                ]}
              >
                <View style={styles.baseMarker}>
                  <View style={styles.markerDot} />
                </View>
              </MapboxGL.PointAnnotation>
            )}

            <MapboxGL.ShapeSource
              id="route-line"
              shape={{
                type: 'Feature',
                geometry: {
                  type: 'LineString',
                  coordinates: routeCoordinates || [
                    [responderData.userLocation.longitude, responderData.userLocation.latitude],
                    [responderData.responderLocation.longitude, responderData.responderLocation.latitude],
                  ],
                },
                properties: {},
              }}
            >
              <MapboxGL.LineLayer
                id="route-layer"
                style={{ lineColor: '#3b82f6', lineWidth: 4, lineJoin: 'round', lineCap: 'round' }}
              />
            </MapboxGL.ShapeSource>
          </>
        )}
      </MapboxGL.MapView>

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
              <TouchableOpacity style={[styles.callButton, styles.messageButton]}>
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
            <Text style={styles.noIncidentSubtext}>Tap above to send a report</Text>
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
});

export default HomeScreen;