

import { MAKATI_OUTER_RING, MAKATI_ENCLAVES, type BoundaryRing } from '@/constants/makati-boundary';

export const MAKATI_CENTER = { lat: 14.5547, lng: 121.0244 };

/**
 * The box the outline fits inside. Worked out from the outline rather than
 * typed in, so the two cannot drift apart, and used only to dismiss a point
 * that is nowhere near before walking six hundred edges. It is not the
 * service area: most of this box is other cities.
 */
export const MAKATI_BOUNDS = MAKATI_OUTER_RING.reduce(
  (box, [lat, lng]) => ({
    north: Math.max(box.north, lat),
    south: Math.min(box.south, lat),
    east: Math.max(box.east, lng),
    west: Math.min(box.west, lng),
  }),
  { north: -Infinity, south: Infinity, east: -Infinity, west: Infinity }
);

// Ray casting: a line drawn east from the point crosses the ring's edges an odd
// number of times if the point is inside it and an even number if it is not.
function ringContains(ring: BoundaryRing, lat: number, lng: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [latI, lngI] = ring[i];
    const [latJ, lngJ] = ring[j];
    const straddles = latI > lat !== latJ > lat;
    if (straddles && lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Whether a point is inside Makati City, judged against the city's actual
 * outline. This is the one place the service area is decided: reports are
 * marked in or out of area by it, and the report form refuses a pin it
 * rejects.
 */
export function isWithinMakati(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return false;
  if (lat < MAKATI_BOUNDS.south || lat > MAKATI_BOUNDS.north) return false;
  if (lng < MAKATI_BOUNDS.west || lng > MAKATI_BOUNDS.east) return false;
  if (!ringContains(MAKATI_OUTER_RING, lat, lng)) return false;
  return !MAKATI_ENCLAVES.some((enclave) => ringContains(enclave, lat, lng));
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