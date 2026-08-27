import Constants from 'expo-constants';

// NOTE: do NOT import @rnmapbox/maps here — that module requires native code
// and will crash in Expo Go. This file only provides a Directions API helper
// which performs HTTP requests to Mapbox web services.
const token = (Constants.expoConfig as any)?.extra?.MAPBOX_TOKEN as string || process.env.MAPBOX_TOKEN;

/**
 * Get directions between two points using Mapbox Directions API
 * Returns GeoJSON LineString coordinates for the route
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

    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${startLng},${startLat};${endLng},${endLat}?access_token=${token}&geometries=geojson`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      const coordinates = data.routes[0].geometry.coordinates;
      console.log('[Mapbox] Got directions with', coordinates.length, 'waypoints');
      return coordinates;
    } else {
      console.warn('[Mapbox] Directions API error:', data.code || 'Unknown error');
      return null;
    }
  } catch (error) {
    console.error('[Mapbox] Error fetching directions:', error);
    return null;
  }
};


