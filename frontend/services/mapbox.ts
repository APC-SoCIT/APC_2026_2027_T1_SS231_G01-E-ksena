import Constants from 'expo-constants';

// NOTE: do NOT import @rnmapbox/maps here — that module requires native code
// and will crash in Expo Go. This file only provides a Directions API helper
// which performs HTTP requests to Mapbox web services.
const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

export interface DirectionsResult {
  coordinates: Array<[number, number]>;
  durationMinutes: number;
  distanceKm: number;
}

/**
 * Get directions between two points using Mapbox Directions API with live traffic
 * Returns GeoJSON LineString coordinates, live estimated duration, and distance
 */
export const getDirections = async (
  startLng: number,
  startLat: number,
  endLng: number,
  endLat: number
): Promise<Array<[number, number]> | null> => {
  try {
    if (!token) {
      console.warn('[Mapbox] No token available for directions API');
      return null;
    }

    // Use driving-traffic profile to dynamically avoid road congestion
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${startLng},${startLat};${endLng},${endLat}?access_token=${token}&geometries=geojson&overview=full`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      const primaryRoute = data.routes[0];
      const coordinates = primaryRoute.geometry.coordinates;
      console.log(
        `[Mapbox] Live traffic route fetched: ${coordinates.length} waypoints, ETA: ${Math.round(
          primaryRoute.duration / 60
        )} mins`
      );
      return coordinates;
    } else {
      console.warn('[Mapbox] Traffic directions error, falling back to standard driving:', data.code);
      // Fallback to standard driving if traffic profile is unavailable in the region
      const fallbackUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${startLng},${startLat};${endLng},${endLat}?access_token=${token}&geometries=geojson`;
      const fallbackRes = await fetch(fallbackUrl);
      const fallbackData = await fallbackRes.json();
      if (fallbackData.code === 'Ok' && fallbackData.routes && fallbackData.routes.length > 0) {
        return fallbackData.routes[0].geometry.coordinates;
      }
      return null;
    }
  } catch (error) {
    console.error('[Mapbox] Error fetching directions:', error);
    return null;
  }
};



