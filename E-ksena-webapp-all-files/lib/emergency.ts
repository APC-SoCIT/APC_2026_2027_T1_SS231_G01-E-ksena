import type { RoleThemeKey } from '@/constants/theme';

export type EmergencyStatus = 'pending' | 'matched' | 'responding' | 'resolved';

export const EMERGENCY_STATUS_LABELS: Record<EmergencyStatus, string> = {
  pending: 'Pending',
  matched: 'Matched',
  responding: 'Responding',
  resolved: 'Resolved',
};

export type EmergencyTypeKey = 'fire' | 'medical' | 'accident' | 'violence' | 'police';

export const EMERGENCY_TYPES: { key: EmergencyTypeKey; label: string; responderRole: RoleThemeKey }[] = [
  { key: 'fire', label: 'Fire', responderRole: 'firefighter' },
  { key: 'medical', label: 'Medical Emergency', responderRole: 'medic' },
  { key: 'accident', label: 'Accident', responderRole: 'medic' },
  { key: 'police', label: 'Police / Security', responderRole: 'police' },
  { key: 'violence', label: 'Violence', responderRole: 'police' },
];

export function matchResponderRole(classifiedAs: string | null | undefined): RoleThemeKey | null {
  if (!classifiedAs) return null;
  const key = classifiedAs.trim().toLowerCase();
  const match = EMERGENCY_TYPES.find((t) => t.key === key);
  return match ? match.responderRole : null;
}

export function getEmergencyTypesForRole(role: RoleThemeKey | undefined): string[] {
  if (!role) return [];
  return EMERGENCY_TYPES.filter((t) => t.responderRole === role).map((t) => t.key);
}

export function defaultEmergencyTypeForRole(role: RoleThemeKey | undefined): EmergencyTypeKey {
  const types = getEmergencyTypesForRole(role);
  return (types[0] as EmergencyTypeKey) ?? 'police';
}

export function emergencyTypeLabel(classifiedAs: string | null | undefined): string {
  if (!classifiedAs) return 'Emergency';
  const key = classifiedAs.trim().toLowerCase();
  const match = EMERGENCY_TYPES.find((t) => t.key === key);
  return match ? match.label : classifiedAs.charAt(0).toUpperCase() + classifiedAs.slice(1);
}

export function nextStatusAction(status: EmergencyStatus | null | undefined): { next: EmergencyStatus; label: string } | null {
  switch (status) {
    case 'pending':
      return { next: 'matched', label: 'Match' };
    case 'matched':
      return { next: 'responding', label: 'Accept' };
    case 'responding':
      return { next: 'resolved', label: 'Done' };
    default:
      return null;
  }
}