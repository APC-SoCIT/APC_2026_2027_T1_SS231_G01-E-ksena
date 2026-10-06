import { haversineKm } from '@/lib/makati';

// When several people report the same emergency, their reports land as separate
// rows. Grouping them means a responder answers once instead of once per caller.
export const PROXIMITY_RADIUS_KM = 0.15; // 150 m
export const PROXIMITY_WINDOW_MINUTES = 30;

export type Groupable = {
  id: string;
  lat: number;
  lng: number;
  classified_as?: string;
  timestamp?: string;
};

export type ReportGroup<T extends Groupable> = {
  /** Identifier of the earliest report, used as the group's key. */
  key: string;
  /** Earliest report in the group. Its status drives the card. */
  lead: T;
  members: T[];
  /** Centre of the grouped reports, where the map marker is placed. */
  lat: number;
  lng: number;
};

function reportTime(r: Groupable): number {
  const parsed = r.timestamp ? Date.parse(r.timestamp) : NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Groups reports that describe the same emergency: same classification, within
 * `radiusKm` of the group's centre, and reported within `windowMinutes` of the
 * group's earliest report. Reports are processed oldest first, so the earliest
 * report always leads its group.
 */
export function groupNearbyReports<T extends Groupable>(
  reports: T[],
  radiusKm: number = PROXIMITY_RADIUS_KM,
  windowMinutes: number = PROXIMITY_WINDOW_MINUTES
): ReportGroup<T>[] {
  const windowMs = windowMinutes * 60 * 1000;
  const sorted = [...reports].sort((a, b) => reportTime(a) - reportTime(b));
  const groups: ReportGroup<T>[] = [];

  for (const report of sorted) {
    const match = groups.find((group) => {
      if ((group.lead.classified_as ?? '') !== (report.classified_as ?? '')) return false;
      if (haversineKm(group.lat, group.lng, report.lat, report.lng) > radiusKm) return false;
      const leadTime = reportTime(group.lead);
      const thisTime = reportTime(report);
      // No usable timestamp on either side: fall back to distance alone.
      if (leadTime === 0 || thisTime === 0) return true;
      return Math.abs(thisTime - leadTime) <= windowMs;
    });

    if (match) {
      match.members.push(report);
      // Recentre on the members so the marker sits in the middle of the cluster.
      match.lat = match.members.reduce((sum, m) => sum + m.lat, 0) / match.members.length;
      match.lng = match.members.reduce((sum, m) => sum + m.lng, 0) / match.members.length;
    } else {
      groups.push({ key: report.id, lead: report, members: [report], lat: report.lat, lng: report.lng });
    }
  }

  return groups;
}
