

export const MAKATI_CENTER = { lat: 14.5547, lng: 121.0244 };

export const MAKATI_BOUNDS = {
  north: 14.58,
  south: 14.5,
  east: 121.07,
  west: 120.99,
};

export function isWithinMakati(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return false;
  return (
    lat >= MAKATI_BOUNDS.south &&
    lat <= MAKATI_BOUNDS.north &&
    lng >= MAKATI_BOUNDS.west &&
    lng <= MAKATI_BOUNDS.east
  );
}

/**
 * Average speed assumed when no routed travel time is available. Deliberately
 * low: this is Makati traffic, not an open road, and a responder told fifteen
 * minutes who arrives in forty has been misled by the dashboard.
 */
export const FALLBACK_SPEED_KMH = 20;

/**
 * Straight-line distance understates the drive, because roads bend and the
 * one-way system in Makati bends them further. 1.3 is the usual urban ratio
 * of road distance to crow-flight distance.
 */
export const ROAD_DETOUR_FACTOR = 1.3;

/**
 * A rough travel time from straight-line distance, for when the Directions
 * API gives nothing back -- outside the service area, or when the request
 * fails. It is an estimate and the caller should present it as one, but an
 * estimate tells a responder more than a dash does.
 */
export function estimateTravelMinutes(straightLineKm: number): number {
  const roadKm = straightLineKm * ROAD_DETOUR_FACTOR;
  return Math.max(1, Math.round((roadKm / FALLBACK_SPEED_KMH) * 60));
}

/** Formats minutes the way the Directions API does, so the two read alike. */
export function formatTravelMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hourPart = `${hours} hour${hours === 1 ? '' : 's'}`;
  return rest === 0 ? hourPart : `${hourPart} ${rest} min${rest === 1 ? '' : 's'}`;
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}