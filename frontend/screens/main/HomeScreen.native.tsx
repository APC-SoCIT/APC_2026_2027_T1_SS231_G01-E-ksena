import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import * as Location from 'expo-location';
import * as SMS from 'expo-sms';
import { MapPin, MessageSquare, Video } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { Polyline } from 'react-native-maps';
import { consumePendingResponderRoute } from '../../services/ReportService';
import { MainStackParamList } from '../../navigation/MainStack';
import { getDirections } from '../../services/mapbox';

type HomeScreenNavigationProp = StackNavigationProp<MainStackParamList, 'MainTabs'>;

const EARTH_RADIUS_KM = 6371;

// Haversine formula to calculate distance between two lat/lng points
const calculateDistance = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
};

const HomeScreen: React.FC = () => {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const { state, setLocation, pendingResponderRoute } = useAuth();
  console.log('[HomeScreen.native] Rendered with pendingResponderRoute:', pendingResponderRoute);
  console.log('[HomeScreen.native] current state.location:', state.location);
  const [locationPermission, setLocationPermission] = useState<boolean>(false);
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);
  const [responderPosition, setResponderPosition] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [activeIncidentId, setActiveIncidentId] = useState<string | null>(null);
  const [responderPhone, setResponderPhone] = useState<string | null>(null);
  const [responderBaseAddress, setResponderBaseAddress] = useState<string | null>(null);
  const [distanceToResponder, setDistanceToResponder] = useState<number | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<Array<{ latitude: number; longitude: number }> | null>(null);

  // Subscribe to responder route from context (gets updated in real-time)
  useEffect(() => {
    if (pendingResponderRoute) {
      console.log('[HomeScreen.native] Received responder route from context:', pendingResponderRoute);
      if (pendingResponderRoute.userLocation && pendingResponderRoute.responderStart) {
        setActiveIncidentId(pendingResponderRoute.incidentId);
        setResponderPosition(pendingResponderRoute.responderStart);
        setResponderPhone(pendingResponderRoute.dispatcherPhone || null);
        setResponderBaseAddress(pendingResponderRoute.responderBase?.address || null);
      }
    }
  }, [pendingResponderRoute]);

  // Fetch road directions when responder position is set
  useEffect(() => {
    if (responderPosition && state.location.latitude && state.location.longitude) {
      const fetchRoute = async () => {
        console.log('[HomeScreen.native] Fetching road directions...');
        const coordinates = await getDirections(
          state.location.longitude!,
          state.location.latitude!,
          responderPosition.longitude,
          responderPosition.latitude
        );
        if (coordinates) {
          console.log('[HomeScreen.native] Got route with', coordinates.length, 'points');
          setRouteCoordinates(coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng })));
        } else {
          console.log('[HomeScreen.native] Directions API failed, using straight line');
          setRouteCoordinates([
            { latitude: state.location.latitude!, longitude: state.location.longitude! },
            { latitude: responderPosition.latitude, longitude: responderPosition.longitude },
          ]);
        }
      };
      fetchRoute();
    }
  }, [responderPosition, state.location.latitude, state.location.longitude]);

  // Debug: log routeCoordinates when available
  useEffect(() => {
    if (routeCoordinates) {
      console.log('[HomeScreen.native] routeCoordinates set, points:', routeCoordinates.length);
    }
  }, [routeCoordinates]);

  useEffect(() => {
    void requestLocationPermission();
  }, []);

  // Calculate distance to responder when positions are available
  useEffect(() => {
    if (responderPosition && state.location.latitude && state.location.longitude) {
      const distance = calculateDistance(
        state.location.latitude,
        state.location.longitude,
        responderPosition.latitude,
        responderPosition.longitude
      );
      setDistanceToResponder(distance);
    } else {
      setDistanceToResponder(null);
    }
  }, [responderPosition, state.location.latitude, state.location.longitude]);

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setLocationPermission(true);
        await getCurrentLocation();
      } else {
        setLocationPermission(false);
        setIsLoadingLocation(false);
        Alert.alert(
          'Location Permission Required',
          'Please enable location access to use emergency features.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error requesting location permission:', error);
      setIsLoadingLocation(false);
    }
  };

  const getCurrentLocation = async () => {
    try {
      setIsLoadingLocation(true);
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { latitude, longitude } = location.coords;
      
      // Get address from coordinates
      const addressResponse = await Location.reverseGeocodeAsync({
        latitude,
        longitude,
      });

      const addressEntry = addressResponse[0];
      const address = addressEntry
        ? `${addressEntry.street || ''} ${addressEntry.city || ''} ${addressEntry.region || ''}`.trim()
        : 'Unknown Location';

      setLocation(latitude, longitude, address);
    } catch (error) {
      console.error('Error getting location:', error);
      Alert.alert('Location Error', 'Unable to get your current location.');
    } finally {
      setIsLoadingLocation(false);
    }
  };

  const handleEmergencyReport = () => {
    navigation.navigate('Video' as any);
  };

  const handleSMSFallback = async () => {
    try {
      console.log('Checking SMS availability...');
      const isAvailable = await SMS.isAvailableAsync();
      console.log('SMS available:', isAvailable);

      if (!isAvailable) {
        Alert.alert('SMS Not Available', 'SMS is not available on this device. Please check your SMS settings.');
        return;
      }

      const { latitude, longitude, address } = state.location;
      console.log('Location:', { latitude, longitude, address });

      if (latitude && longitude) {
        const locationText = address || `${latitude}, ${longitude}`;
        const message = `EMERGENCY: I need help at ${locationText}. Please send assistance immediately.`;
        const smsNumber = responderPhone || '+12345678901'; // Use Fire Station #1 as emergency contact

        console.log('Sending SMS to:', smsNumber);
        console.log('Message:', message);

        // Send SMS via device
        const smsResult = await SMS.sendSMSAsync([smsNumber], message);
        console.log('SMS result:', smsResult);

        if (smsResult.result === 'sent') {
          Alert.alert('SMS Sent', `Emergency SMS has been sent to ${smsNumber}.`);
        } else if (smsResult.result === 'cancelled') {
          Alert.alert('SMS Cancelled', 'The SMS was cancelled.');
        } else {
          Alert.alert('SMS Status Unknown', `SMS may have been sent to ${smsNumber}, but status is unknown.`);
        }
      } else {
        Alert.alert('Location Error', 'Unable to get your location. Please try again.');
      }
    } catch (error) {
      console.error('Error sending SMS:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Alert.alert('SMS Error', `Failed to send emergency SMS: ${errorMessage}`);
    }
  };

  

  const { latitude, longitude, address } = state.location;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.welcomeText}>Welcome, {state.auth.user?.name}</Text>
        <Text style={styles.subtitle}>Emergency Response System</Text>
      </View>

      <View style={styles.mapContainer}>
        {locationPermission && latitude && longitude ? (
          <MapView
            style={styles.map}
            initialRegion={{
              latitude,
              longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
            showsUserLocation={true}
            showsMyLocationButton={true}
          >
            <Marker
              coordinate={{ latitude, longitude }}
              title="Your Location"
              description={address || 'Current Location'}
            />

            {responderPosition && (
              <>
                {console.log('Rendering responder marker at:', responderPosition)}
                <Marker
                  coordinate={responderPosition}
                  title={activeIncidentId ? `Responder (Incident ${activeIncidentId})` : 'Responder'}
                  description={
                    responderBaseAddress
                      ? `Base: ${responderBaseAddress}`
                      : 'En route to your location'
                  }
                  pinColor="#2563eb"
                />

                {/* Draw route: prefer routed coordinates, fallback to straight line */}
                <Polyline
                  coordinates={
                    routeCoordinates && routeCoordinates.length > 0
                      ? routeCoordinates
                      : [responderPosition, { latitude, longitude }]
                  }
                  strokeColor="#2563eb"
                  strokeWidth={3}
                />
              </>
            )}
          </MapView>
        ) : (
          <View style={styles.mapPlaceholder}>
            <MapPin size={48} color="#9ca3af" />
            <Text style={styles.mapPlaceholderText}>
              {isLoadingLocation ? 'Loading location...' : 'Location not available'}
            </Text>
            {!locationPermission && (
              <TouchableOpacity style={styles.enableLocationButton} onPress={requestLocationPermission}>
                <Text style={styles.enableLocationText}>Enable Location</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Location Info */}
        {latitude && longitude && (
          <View style={styles.locationInfo}>
            <MapPin size={16} color="#dc2626" />
            <Text style={styles.locationText}>
              {address || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`}
            </Text>
          </View>
        )}

        {/* Responder Distance Info */}
        {distanceToResponder !== null && (
          <View style={styles.distanceInfo}>
            <Text style={styles.distanceText}>
              Distance to responder: {distanceToResponder.toFixed(2)} km
            </Text>
          </View>
        )}
      </View>

      {/* Emergency Actions */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity style={styles.emergencyButton} onPress={handleEmergencyReport}>
          <Video size={24} color="#ffffff" />
          <Text style={styles.emergencyButtonText}>Press to Send Report</Text>
        </TouchableOpacity>

        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.quickActionButton} onPress={handleSMSFallback}>
            <MessageSquare size={20} color="#dc2626" />
            <Text style={styles.quickActionText}>SMS</Text>
          </TouchableOpacity>

          {/* Call action removed per request */}
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  welcomeText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  mapContainer: {
    flex: 1,
    margin: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
  },
  map: {
    flex: 1,
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  mapPlaceholderText: {
    fontSize: 16,
    color: '#6b7280',
    marginTop: 12,
    textAlign: 'center',
  },
  enableLocationButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#dc2626',
    borderRadius: 8,
  },
  enableLocationText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  locationInfo: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  locationText: {
    fontSize: 12,
    color: '#374151',
    marginLeft: 6,
    flex: 1,
  },
  distanceInfo: {
    position: 'absolute',
    top: 60,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  distanceText: {
    fontSize: 12,
    color: '#2563eb',
    fontWeight: '600',
  },
  actionsContainer: {
    padding: 20,
    backgroundColor: '#ffffff',
  },
  emergencyButton: {
    backgroundColor: '#dc2626',
    borderRadius: 16,
    height: 60,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  emergencyButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  quickActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  quickActionText: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
});

export default HomeScreen;



 

