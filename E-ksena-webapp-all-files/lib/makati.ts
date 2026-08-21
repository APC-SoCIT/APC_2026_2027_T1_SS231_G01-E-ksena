

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