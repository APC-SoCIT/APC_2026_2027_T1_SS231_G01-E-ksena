export type IncidentStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'en_route'
  | 'on_scene'
  | 'resolved';

export type Incident = {
  id: string;
  title: string;
  content: string;
  created_at?: string;
  status?: IncidentStatus;
  latitude?: number;
  longitude?: number;
  assigned_to?: string;
};

export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  declined: 'Declined',
  en_route: 'En route',
  on_scene: 'On scene',
  resolved: 'Resolved',
};