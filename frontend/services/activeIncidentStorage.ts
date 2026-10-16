import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ResponderRoutePayload } from './ReportService';

const ACTIVE_INCIDENT_KEY = '@eksena_active_incident';

type StoredActiveIncident = {
  userId: string;
  route: ResponderRoutePayload;
};

export const saveActiveIncident = async (userId: string, route: ResponderRoutePayload) => {
  await AsyncStorage.setItem(ACTIVE_INCIDENT_KEY, JSON.stringify({ userId, route }));
};

export const loadActiveIncident = async (userId: string): Promise<ResponderRoutePayload | null> => {
  const raw = await AsyncStorage.getItem(ACTIVE_INCIDENT_KEY);
  if (!raw) return null;

  try {
    const stored = JSON.parse(raw) as StoredActiveIncident;
    return stored.userId === userId ? stored.route : null;
  } catch {
    await AsyncStorage.removeItem(ACTIVE_INCIDENT_KEY);
    return null;
  }
};

export const clearActiveIncident = () => AsyncStorage.removeItem(ACTIVE_INCIDENT_KEY);

export const hasActiveIncident = async (userId: string) => !!(await loadActiveIncident(userId));
