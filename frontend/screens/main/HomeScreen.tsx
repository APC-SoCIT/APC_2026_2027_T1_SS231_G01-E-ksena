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
import { consumePendingResponderRoute, ResponderRoutePayload } from '../../services/ReportService';
import { clearActiveIncident, loadActiveIncident, saveActiveIncident } from '../../services/activeIncidentStorage';
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
  status?: string;
}

const HomeScreen: React.FC = () => {
  const navigation = useNavigation();
  const { state, setLocation, pendingResponderRoute } = useAuth();

  const [responderData, setResponderData] = useState<ResponderData | null>(null);
  const dispatchChannelRef = useRef<any>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<Array<[number, number]> | null>(null);
  const [distance, setDistance] = useState(0);
  const [eta, setETA] = useState('');
  const mapRef = useRef<MapView>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([
    state.location.longitude || 121.0215128,
    state.location.latitude || 14.5310248,
  ]);

  // Keep the latest active route available after an accidental app close,
  // including live responder position and classification updates.
  useEffect(() => {
    if (!responderData || !state.auth.user?.id || responderData.status === 'resolved') return;
    void saveActiveIncident(state.auth.user.id, {
      incidentId: responderData.incidentId,
      userLocation: responderData.userLocation,
      responderStart: responderData.responderLocation,
      responderBase: responderData.responderBase,
      dispatcherName: responderData.dispatcherName,
      dispatcherPhone: responderData.dispatcherPhone ?? undefined,
      serviceType: responderData.serviceType,
    });
  }, [responderData, state.auth.user?.id]);

  // 1. Instantly sync whenever a new route is dispatched
  useEffect(() => {
    if (pendingResponderRoute) {
      console.log('[HomeScreen] Syncing with pendingResponderRoute:', pendingResponderRoute);
      setResponderData({
        incidentId: pendingResponderRoute.incidentId,
        userLocation: pendingResponderRoute.userLocation,
        responderLocation: pendingResponderRoute.responderStart,
        responderBase: pendingResponderRoute.responderBase,
        dispatcherName: pendingResponderRoute.dispatcherName || 'Emergency Responder',
        dispatcherPhone: pendingResponderRoute.dispatcherPhone,
        serviceType: pendingResponderRoute.serviceType,
      });
      if (state.auth.user?.id) {
        void saveActiveIncident(state.auth.user.id, pendingResponderRoute);
      }
    }
  }, [pendingResponderRoute, state.auth.user?.id]);

  // 2. Also check on screen focus or restore active incident from Supabase if app was reloaded
  useEffect(() => {
    const checkActiveIncident = async () => {
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
        if (state.auth.user?.id) {
          void saveActiveIncident(state.auth.user.id, pending);
        }
        return;
      }

      if (!responderData && state.auth.user?.id) {
        const persisted = await loadActiveIncident(state.auth.user.id);
        if (persisted) {
          setResponderData({
            incidentId: persisted.incidentId,
            userLocation: persisted.userLocation,
            responderLocation: persisted.responderStart,
            responderBase: persisted.responderBase,
            dispatcherName: persisted.dispatcherName || 'Emergency Responder',
            dispatcherPhone: persisted.dispatcherPhone,
            serviceType: persisted.serviceType,
          });
          return;
        }
      }

      // If not in memory, query Supabase for citizen's most recent active incident
      if (!responderData && (state.auth.user?.id || state.auth.user?.phone)) {
        try {
          const userPhone = state.auth.user?.phone;
          const userId = state.auth.user?.id;

          let incidentQuery = supabase
            .from('incidents')
            .select('incident_id, incident_location_lat, incident_location_lng, location_address, created_at')
            .order('created_at', { ascending: false })
            .limit(1);

          if (userId && userPhone) {
            incidentQuery = incidentQuery.or(`user_id.eq.${userId},user_phone_number.eq.${userPhone}`);
          } else if (userId) {
            incidentQuery = incidentQuery.eq('user_id', userId);
          } else if (userPhone) {
            incidentQuery = incidentQuery.eq('user_phone_number', userPhone);
          }

          const { data: latestIncident, error: incErr } = await incidentQuery.maybeSingle();

          if (latestIncident && !incErr) {
            // Check if there is an active (unresolved) dispatch for it
            const { data: activeDispatch } = await supabase
              .from('dispatch')
              .select('status, current_lat, current_lng, responder_id, service_type')
              .eq('incident_id', latestIncident.incident_id)
              .neq('status', 'resolved')
              .maybeSingle();

            if (activeDispatch) {
              const { data: resp } = await supabase
                .from('responders')
                .select('name, responder_phone_number, service_type, responder_location_lat, responder_location_lng, station_address')
                .eq('responder_id', activeDispatch.responder_id)
                .maybeSingle();

              const rLat = activeDispatch.current_lat || resp?.responder_location_lat || (latestIncident.incident_location_lat + 0.005);
              const rLng = activeDispatch.current_lng || resp?.responder_location_lng || (latestIncident.incident_location_lng - 0.005);

              const restoredRoute: ResponderRoutePayload = {
                incidentId: latestIncident.incident_id,
                userLocation: {
                  latitude: parseFloat(latestIncident.incident_location_lat),
                  longitude: parseFloat(latestIncident.incident_location_lng),
                  address: latestIncident.location_address,
                },
                responderStart: {
                  latitude: parseFloat(rLat),
                  longitude: parseFloat(rLng),
                },
                responderBase: resp ? {
                  name: resp.name,
                  latitude: parseFloat(resp.responder_location_lat || rLat),
                  longitude: parseFloat(resp.responder_location_lng || rLng),
                  address: resp.station_address,
                } : undefined,
                dispatcherName: resp?.name || 'Emergency Responder',
                dispatcherPhone: resp?.responder_phone_number,
                // The dispatch classification belongs to the incident. The responder's
                // specialty is only a fallback for older rows without service_type.
                serviceType: activeDispatch.service_type || resp?.service_type,
              };
              setResponderData({
                incidentId: restoredRoute.incidentId,
                userLocation: restoredRoute.userLocation,
                responderLocation: restoredRoute.responderStart,
                responderBase: restoredRoute.responderBase,
                dispatcherName: restoredRoute.dispatcherName || 'Emergency Responder',
                dispatcherPhone: restoredRoute.dispatcherPhone,
                serviceType: restoredRoute.serviceType,
                status: activeDispatch.status,
              });
              if (state.auth.user?.id) {
                void saveActiveIncident(state.auth.user.id, restoredRoute);
              }
            }
          }
        } catch (restoreErr) {
          console.warn('[HomeScreen] Could not restore active incident:', restoreErr);
        }
      }
    };

    const unsubscribe = (navigation as any).addListener?.('focus', checkActiveIncident);
    checkActiveIncident();

    return () => unsubscribe?.();
  }, [navigation, state.auth.user?.id]);

  useEffect(() => {
    let locationSubscription: Location.LocationSubscription | null = null;
    let isInitialCenter = true;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Denied', 'Allow location access to use this app properly.');
          return;
        }

        // Get accurate initial position
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Highest,
        });

        const { latitude, longitude } = location.coords;
        Location.reverseGeocodeAsync({ latitude, longitude }).then((addressResponse) => {
          const addressEntry = addressResponse[0];
          const address = addressEntry
            ? `${addressEntry.street || ''} ${addressEntry.city || ''} ${addressEntry.region || ''}`.trim()
            : 'Unknown Location';
          setLocation(latitude, longitude, address);
        }).catch(() => {});

        setLocation(latitude, longitude);
        setMapCenter([longitude, latitude]);

        if (mapRef.current) {
          mapRef.current.animateToRegion({
            latitude,
            longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }, 800);
        }

        // Continually track location changes with high accuracy
        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 3000,
            distanceInterval: 5,
          },
          (newLocation) => {
            const { latitude: newLat, longitude: newLng } = newLocation.coords;
            setLocation(newLat, newLng, state.location.address || undefined);
            if (isInitialCenter) {
              isInitialCenter = false;
              setMapCenter([newLng, newLat]);
            }
          }
        );
      } catch (error) {
        console.error('Location Error:', error);
      }
    })();

    return () => {
      locationSubscription?.remove();
    };
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


  // Listen for dispatch live updates (classification, status, and location)
  useEffect(() => {
    if (!responderData?.incidentId) {
      if (dispatchChannelRef.current) {
        supabase.removeChannel(dispatchChannelRef.current);
        dispatchChannelRef.current = null;
      }
      return;
    }

    const incidentId = responderData.incidentId;

    // 1. Initial read: check existing row when tracking starts
    (async () => {
      try {
        const { data: dispatchRow, error } = await supabase
          .from('dispatch')
          .select('status, current_lat, current_lng, location_updated_at, service_type')
          .eq('incident_id', incidentId)
          .maybeSingle();

        if (dispatchRow && !error) {
          console.log('[DISPATCH] Initial row loaded:', dispatchRow);
          if (dispatchRow.status === 'resolved') {
            setResponderData(null);
            await clearActiveIncident();
            return;
          }
          setResponderData((prev) => {
            if (!prev) return null;
            const updatedLocation =
              dispatchRow.current_lat && dispatchRow.current_lng
                ? { latitude: parseFloat(dispatchRow.current_lat), longitude: parseFloat(dispatchRow.current_lng) }
                : prev.responderLocation;

            return {
              ...prev,
              status: dispatchRow.status || prev.status,
              serviceType: dispatchRow.service_type || prev.serviceType,
              responderLocation: updatedLocation,
            };
          });
        }
      } catch (err) {
        console.warn('[DISPATCH] Error reading initial dispatch row:', err);
      }
    })();

    // 2. Realtime listener: update live marker position, route, and status
    const channel = supabase
      .channel(`dispatch-live-${incidentId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'dispatch',
          filter: `incident_id=eq.${incidentId}`,
        },
        (payload) => {
          const newRecord = payload.new;
          console.log('[DISPATCH] Realtime update received:', newRecord);

          if (!newRecord) return;

          // Check for completed / resolved status
          if (newRecord.status === 'resolved') {
            Alert.alert(
              '✅ Dispatch Has Arrived!',
              'The emergency responder has arrived at your location and marked the incident as resolved.',
              [
                {
                  text: 'OK',
                  onPress: () => {
                    if (dispatchChannelRef.current) {
                      supabase.removeChannel(dispatchChannelRef.current);
                      dispatchChannelRef.current = null;
                    }
                    setResponderData(null);
                    void clearActiveIncident();
                  },
                },
              ]
            );
            return;
          }

          // Move responder marker to live current_lat/current_lng and update status
          setResponderData((prev) => {
            if (!prev) return null;
            const hasNewCoordinates = newRecord.current_lat && newRecord.current_lng;
            const updatedLocation = hasNewCoordinates
              ? { latitude: parseFloat(newRecord.current_lat), longitude: parseFloat(newRecord.current_lng) }
              : prev.responderLocation;

            return {
              ...prev,
              status: newRecord.status || prev.status,
              serviceType: newRecord.service_type || prev.serviceType,
              responderLocation: updatedLocation,
            };
          });
        }
      )
      .subscribe();

    dispatchChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      dispatchChannelRef.current = null;
    };
  }, [responderData?.incidentId]);

  const handleEmergencyReport = async () => {
    if (responderData && responderData.status !== 'resolved') {
      Alert.alert('Active emergency', 'Only one emergency report can be active at a time.');
      return;
    }

    const servicesEnabled = await Location.hasServicesEnabledAsync();
    const permission = await Location.getForegroundPermissionsAsync();
    if (!servicesEnabled || permission.status !== 'granted') {
      Alert.alert('Location required', 'Enable location services and allow location access before sending a report.');
      return;
    }

    try {
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLocation(current.coords.latitude, current.coords.longitude, state.location.address || undefined);
    } catch {
      Alert.alert('Location unavailable', 'Could not get your current location. Please try again.');
      return;
    }
    (navigation as any).navigate('Video');
  };

  const handleSMSFallback = () => {
    (navigation as any).navigate('SmsChatScreen', {
      responderPhone: responderData?.dispatcherPhone || '',
      incidentId: responderData?.incidentId || null,
      responderName: responderData?.dispatcherName || 'Emergency Dispatch',
      serviceType: responderData?.serviceType || 'medical',
    });
  };

  const handleCallResponder = () => {
    (navigation as any).navigate('CallScreen', {
      incidentId: responderData?.incidentId || 'active-emergency',
      responderPhone: responderData?.dispatcherPhone || ''
    });
  };

  const userCoordinate: [number, number] = [
    responderData?.userLocation.longitude || state.location.longitude || 121.0215128,
    responderData?.userLocation.latitude || state.location.latitude || 14.5310248,
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider="google"
        showsUserLocation={true}
        showsMyLocationButton={true}
        initialRegion={{
          latitude: mapCenter[1],
          longitude: mapCenter[0],
          latitudeDelta: 0.015,
          longitudeDelta: 0.015,
        }}
      >
        {/* Responder markers and route */}
        {responderData && (
          <>
            <Marker
              coordinate={{
                latitude: responderData.responderLocation.latitude,
                longitude: responderData.responderLocation.longitude,
              }}
              anchor={{ x: 0.5, y: 0.5 }}
              title="Responder Unit"
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
                anchor={{ x: 0.5, y: 0.5 }}
                title={responderData.responderBase.name || 'Station'}
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
                  <Text style={styles.serviceType}>
                    {`${responderData.serviceType.charAt(0).toUpperCase()}${responderData.serviceType.slice(1).toLowerCase()}`}
                  </Text>
                )}
              </View>
              {responderData.status && (
                <View
                  style={[
                    styles.statusBadge,
                    responderData.status === 'arrived'
                      ? styles.statusBadgeArrived
                      : styles.statusBadgeEnRoute,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusBadgeText,
                      responderData.status === 'arrived'
                        ? styles.statusBadgeTextArrived
                        : styles.statusBadgeTextEnRoute,
                    ]}
                  >
                    {responderData.status === 'arrived'
                      ? 'Responder has arrived'
                      : responderData.status === 'en_route'
                      ? 'Responder on the way'
                      : responderData.status.toUpperCase()}
                  </Text>
                </View>
              )}
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
  userMarkerPulse: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(59, 130, 246, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userMarker: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  responderMarker: {
    backgroundColor: '#ef4444',
    borderRadius: 12,
    padding: 6,
    borderWidth: 2,
    borderColor: '#ffffff',
    elevation: 4,
  },
  baseMarker: {
    backgroundColor: '#fbbf24',
    borderRadius: 12,
    padding: 6,
    borderWidth: 2,
    borderColor: '#ffffff',
    elevation: 4,
  },
  markerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ffffff' },
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
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  statusBadgeEnRoute: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  statusBadgeArrived: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#10b981',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusBadgeTextEnRoute: {
    color: '#1d4ed8',
  },
  statusBadgeTextArrived: {
    color: '#047857',
  },
});

export default HomeScreen;
