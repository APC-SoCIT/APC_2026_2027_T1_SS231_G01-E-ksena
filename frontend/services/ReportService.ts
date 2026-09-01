// ReportService for E-KSENA Emergency Response App
// Real backend implementation for emergency reporting

import Constants from 'expo-constants';
import { Platform } from 'react-native';

const PUBLIC_ENV_URL = (typeof process !== 'undefined' ? (process as any).env?.EXPO_PUBLIC_API_BASE_URL : undefined) as string | undefined;

const EXPO_CONFIG_URL = (Constants?.expoConfig as any)?.extra?.API_BASE_URL as string | undefined;
const MANIFEST_URL = (Constants?.manifest as any)?.extra?.API_BASE_URL as string | undefined;

let CONFIG_BASE_URL =
  PUBLIC_ENV_URL ||
  EXPO_CONFIG_URL ||
  MANIFEST_URL ||
  'http://127.0.0.1:3000/api'; // Fallback for dev

// Helpful diagnostics: show where the URL came from
console.log('[ReportService] API URL sources:', {
  EXPO_PUBLIC_API_BASE_URL: PUBLIC_ENV_URL,
  expoConfigExtra: EXPO_CONFIG_URL,
  manifestExtra: MANIFEST_URL,
  selected: CONFIG_BASE_URL,
});

// If someone accidentally configured a LAN IP with https:// (common mistake),
// auto-downgrade to http:// because the local Express server doesn't serve TLS.
// (We do NOT do this for ngrok/real HTTPS domains.)
if (/^https:\/\/(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(CONFIG_BASE_URL)) {
  CONFIG_BASE_URL = CONFIG_BASE_URL.replace(/^https:\/\//, 'http://');
}

// Normalize localhost for Android emulator (NOT when using tunnel)
// When using tunnel, Expo creates a bridge that works with the configured IP
if ((CONFIG_BASE_URL.includes('localhost') || CONFIG_BASE_URL.includes('127.0.0.1')) && !Constants.appOwnership) {
  if (Platform.OS === 'android') {
    CONFIG_BASE_URL = CONFIG_BASE_URL.replace('localhost', '10.0.2.2').replace('127.0.0.1', '10.0.2.2');
  }
}

const API_BASE_URL = CONFIG_BASE_URL; // Configurable API URL
console.log('[ReportService] Using API base URL:', API_BASE_URL);

// HTTP Client Configuration
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

class ApiClient {
  private baseURL: string;
  private authToken: string | null = null;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  setAuthToken(token: string) {
    this.authToken = token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    timeoutMs: number = 30000  // Increased from 15s to 30s for better reliability
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseURL}${endpoint}`;
    console.log(`[API CLIENT] Making ${options.method || 'GET'} request to: ${url}`);
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });
      clearTimeout(id);

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP error! status: ${response.status} @ ${url}`,
        };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      let message = 'Unknown error occurred';
      
      if ((error as any)?.name === 'AbortError') {
        message = 'Request timed out after 30 seconds';
      } else if (error instanceof TypeError && error.message.includes('Network request failed')) {
        message = `Cannot connect to backend server at ${url}. Please check:\n1. Backend server is running (node server.js)\n2. IP address is correct (${API_BASE_URL})\n3. Firewall allows connections on port 3000`;
      } else if (error instanceof Error) {
        message = error.message;
      }
      
      // Use warn instead of error to reduce LogBox noise, but still log details
      console.warn(`[API CLIENT] Request failed to ${url}:`, message);
      console.warn(`[API CLIENT] Full error:`, error);
      
      return {
        success: false,
        error: message,
      };
    }
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, data: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async put<T>(endpoint: string, data: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

const apiClient = new ApiClient(API_BASE_URL);

// --- Simple in-memory store to pass responder routing intent to HomeScreen ---
// moved up so report senders can set a pending route on network failure
export type ResponderRoutePayload = {
  incidentId: string;
  responderStart: { latitude: number; longitude: number };
  userLocation: { latitude: number; longitude: number; address?: string };
  dispatcherName?: string;
  dispatcherPhone?: string;
  responderBase?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string | null;
  };
};

let pendingResponderRoute: ResponderRoutePayload | null = null;
// Simple in-memory store + notifier for pending responder route
let pendingResponderRouteListeners: Array<(p: ResponderRoutePayload) => void> = [];

export const setPendingResponderRoute = (payload: ResponderRoutePayload) => {
  console.log('[ReportService] setPendingResponderRoute called with:', JSON.stringify(payload, null, 2));
  pendingResponderRoute = payload;
  // notify listeners (non-blocking)
  try {
    console.log(`[ReportService] Notifying ${pendingResponderRouteListeners.length} listener(s)`);
    pendingResponderRouteListeners.forEach(fn => {
      try {
        fn(payload);
      } catch (e) {
        console.warn('[ReportService] pending route listener error', e);
      }
    });
  } catch (e) {
    console.warn('[ReportService] Error notifying pending route listeners', e);
  }
};

export const consumePendingResponderRoute = (): ResponderRoutePayload | null => {
  const current = pendingResponderRoute;
  pendingResponderRoute = null;
  return current;
};

export const onPendingResponderRoute = (fn: (p: ResponderRoutePayload) => void) => {
  pendingResponderRouteListeners.push(fn);
  return () => {
    pendingResponderRouteListeners = pendingResponderRouteListeners.filter(x => x !== fn);
  };
};

export interface EmergencyReport {
  id: string;
  userId: string;
  type: 'video' | 'audio' | 'text' | 'sms';
  location: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  timestamp: string;
  status: 'pending' | 'assigned' | 'in_progress' | 'resolved';
  assignedDispatcher?: {
    id: string;
    name: string;
    phone: string;
  };
  responderBase?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string | null;
  };
  mediaUri?: string;
  description?: string;
}

export interface ReportResponse {
  success: boolean;
  report: EmergencyReport;
  message: string;
}

export interface IncidentListResponse {
  success: boolean;
  incidents: EmergencyReport[];
}

export interface CreateReportRequest {
  type: 'video' | 'audio' | 'text' | 'sms';
  location: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  mediaUri?: string;
  description?: string;
}

export interface UpdateStatusRequest {
  status: EmergencyReport['status'];
}

// Initialize API client with auth token
export const initializeReportService = (authToken: string) => {
  apiClient.setAuthToken(authToken);
};

// Real send video report function
export const sendVideoReport = async (
  videoUri: string,
  location: { latitude: number; longitude: number; address?: string },
  userPhoneNumber: string,
  videoUrl?: string
): Promise<ReportResponse> => {
  try {
    console.log(`[REAL API] ========== STARTING VIDEO REPORT CREATION ==========`);
    console.log(`[REAL API] API_BASE_URL configured as:`, API_BASE_URL);
    console.log(`[REAL API] Sending report from location:`, location);
    console.log(`[REAL API] User phone:`, userPhoneNumber);

    // Backend expects: { lat, lng, user_phone_number, location_address, video_url }
    const requestData = {
      lat: location.latitude,
      lng: location.longitude,
      user_phone_number: userPhoneNumber,
      location_address: location.address || null,
      video_url: videoUrl || 'mock://video',
    };

    console.log(`[REAL API] Request payload:`, JSON.stringify(requestData, null, 2));
    console.log(`[REAL API] Calling: POST ${API_BASE_URL}/report-incident`);

    // Call backend /api/report-incident endpoint
    const createResp = await apiClient.post<{ success: boolean; message: string; incident_id: string }>('/report-incident', requestData);

    console.log(`[REAL API] Response received:`, createResp);

    if (!createResp.success || !createResp.data) {
      // network/backend failed — fallback to creating a local/offline report so UI can continue
      console.error(`[REAL API] ❌ BACKEND REQUEST FAILED!`);
      console.error(`[REAL API] Error was:`, createResp.error || 'Unknown error (no error message returned)');
      console.error(`[REAL API] This is why no incident was created in the database!`);
      
      const offlineReport: EmergencyReport = {
        id: `local_${Date.now()}`,
        userId: 'local_user',
        type: 'video',
        location,
        timestamp: new Date().toISOString(),
        status: 'pending',
        mediaUri: videoUri,
        description: 'Offline video report (created locally due to network failure)',
      };

      // create a responder route payload so HomeScreen can route to this incident
      setPendingResponderRoute({
        incidentId: offlineReport.id,
        responderStart: {
          latitude: location.latitude + 0.005,
          longitude: location.longitude + 0.005,
        },
        userLocation: location,
        dispatcherName: 'Local Responder (approx.)',
      });

      return {
        success: true,
        report: offlineReport,
        message: 'Report created offline. Wait for responder update.',
      };
    }

    const incidentId = createResp.data.incident_id;
    console.log(`[REAL API] ✅ Incident successfully created with ID: ${incidentId}`);
    console.log(`[REAL API] Now waiting 5 seconds for AI analysis and responder assignment...`);

    // Wait for AI analysis to complete (backend processes async)
    // 5 seconds gives the backend time to query responders
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log(`[REAL API] 5 seconds elapsed, fetching incident details...`);

    // Fetch incident details to get responder assignment
    const incidentDetails = await getIncidentDetails(incidentId);
    
    console.log(`[REAL API] Incident details response:`, incidentDetails);

    if (!incidentDetails.success || !incidentDetails.report) {
      console.warn('[REAL API] ⚠️ Could not get incident details, creating offline fallback');
      console.warn('[REAL API] Error was:', incidentDetails.message);
      // If we can't get details, create a basic report with fallback location
      const basicReport: EmergencyReport = {
        id: incidentId,
        userId: 'user',
        type: 'video',
        location,
        timestamp: new Date().toISOString(),
        status: 'pending',
        mediaUri: videoUri,
        description: 'Emergency video report submitted',
      };

      setPendingResponderRoute({
        incidentId: incidentId,
        responderStart: {
          latitude: location.latitude + 0.01,
          longitude: location.longitude - 0.01,
        },
        userLocation: location,
        dispatcherName: 'Responder (pending assignment)',
      });

      return {
        success: true,
        report: basicReport,
        message: createResp.data.message || 'Report submitted. Waiting for responder assignment.',
      };
    }

    const report = incidentDetails.report;
    console.log('[REAL API] ✅ Got incident details successfully!');
    console.log('[REAL API] Assigned dispatcher:', report.assignedDispatcher);
    console.log('[REAL API] Responder base:', report.responderBase);

    // Use responder base location if available; else fallback offset near user
    const responderStart = report.responderBase
      ? {
          latitude: report.responderBase.latitude,
          longitude: report.responderBase.longitude,
        }
      : {
          latitude: location.latitude + 0.01,
          longitude: location.longitude - 0.01,
        };

    console.log('[REAL API] Using responder start position:', responderStart);

    // Set pending route with responder info
    setPendingResponderRoute({
      incidentId: report.id,
      responderStart,
      userLocation: location,
      dispatcherName: report.assignedDispatcher?.name || 'Assigned Responder',
      dispatcherPhone: report.assignedDispatcher?.phone,
      responderBase: report.responderBase,
    });

    console.log(`[REAL API] ========== VIDEO REPORT COMPLETE - INCIDENT ${report.id} CREATED ==========`);

    return {
      success: true,
      report,
      message: 'Emergency report submitted successfully. Responder assigned.',
    };
  } catch (error) {
    console.error('[REAL API] ❌ EXCEPTION:', error);
    return {
      success: false,
      report: {} as EmergencyReport,
      message: 'Network error occurred while sending video report',
    };
  }
};

// Real send SMS report function
export const sendSMSReport = async (
  message: string,
  location: { latitude: number; longitude: number; address?: string }
): Promise<ReportResponse> => {
  try {
    console.log(`[REAL API] Sending SMS report: ${message}`);
    
    const requestData: CreateReportRequest = {
      type: 'sms',
      location,
      description: message,
    };

    const response = await apiClient.post<EmergencyReport>('/reports/sms', requestData);
    
    if (response.success && response.data) {
      return {
        success: true,
        report: response.data,
        message: response.message || 'SMS emergency report sent successfully.',
      };
    } else {
      return {
        success: false,
        report: {} as EmergencyReport,
        message: response.error || 'Failed to send SMS report',
      };
    }
  } catch (error) {
    console.error('Error sending SMS report:', error);
    return {
      success: false,
      report: {} as EmergencyReport,
      message: 'Network error occurred while sending SMS report',
    };
  }
};

// Real get user incidents function
export const getUserIncidents = async (userId: string): Promise<IncidentListResponse> => {
  try {
    console.log(`[REAL API] Fetching incidents for user: ${userId}`);
    
    const response = await apiClient.get<EmergencyReport[]>(`/users/${userId}/incidents`);
    
    if (response.success && response.data) {
      return {
        success: true,
        incidents: response.data,
      };
    } else {
      return {
        success: false,
        incidents: [],
      };
    }
  } catch (error) {
    console.error('Error fetching user incidents:', error);
    return {
      success: false,
      incidents: [],
    };
  }
};

// Real update incident status function
export const updateIncidentStatus = async (
  incidentId: string,
  status: EmergencyReport['status']
): Promise<{ success: boolean; message: string }> => {
  try {
    console.log(`[REAL API] Updating incident ${incidentId} status to: ${status}`);
    
    const requestData: UpdateStatusRequest = { status };
    const response = await apiClient.put(`/incidents/${incidentId}/status`, requestData);
    
    if (response.success) {
      return {
        success: true,
        message: response.message || `Incident status updated to ${status}`,
      };
    } else {
      return {
        success: false,
        message: response.error || 'Failed to update incident status',
      };
    }
  } catch (error) {
    console.error('Error updating incident status:', error);
    return {
      success: false,
      message: 'Network error occurred while updating incident status',
    };
  }
};

// Additional utility functions for real backend

// Get incident details by ID
export const getIncidentDetails = async (incidentId: string): Promise<ReportResponse> => {
  try {
    console.log(`[REAL API] Fetching incident details for: ${incidentId}`);
    
    // Backend endpoint: GET /api/incident/:incidentId
    const response = await apiClient.get<{
      success: boolean;
      incident: {
        id: string;
        user_phone_number: string;
        responder_phone_number: string | null;
        service_type: string;
        location: { latitude: number; longitude: number; address?: string };
        status: string;
        created_at: string;
        assigned_at?: string;
        assigned_dispatcher?: { id: string; name: string; phone: string } | null;
        responder_base?: { name?: string; latitude: number; longitude: number; address?: string | null } | null;
      };
    }>(`/incident/${incidentId}`);
    
    if (response.success && response.data?.incident) {
      const backendIncident = response.data.incident;
      console.log('[REAL API] Backend incident response:', backendIncident);
      
      // Map backend response to EmergencyReport format
      const report: EmergencyReport = {
        id: backendIncident.id,
        userId: backendIncident.user_phone_number,
        type: 'video', // Default type
        location: backendIncident.location,
        timestamp: backendIncident.created_at,
        status: backendIncident.status as EmergencyReport['status'],
        assignedDispatcher: backendIncident.assigned_dispatcher
          ? {
              id: backendIncident.assigned_dispatcher.id,
              name: backendIncident.assigned_dispatcher.name,
              phone: backendIncident.assigned_dispatcher.phone,
            }
          : undefined,
        responderBase: backendIncident.responder_base
          ? {
              latitude: backendIncident.responder_base.latitude,
              longitude: backendIncident.responder_base.longitude,
              name: backendIncident.responder_base.name,
              address: backendIncident.responder_base.address ?? undefined,
            }
          : undefined,
        description: `Emergency ${backendIncident.service_type} incident`,
      };

      console.log('[REAL API] Mapped report:', {
        id: report.id,
        assignedDispatcher: report.assignedDispatcher,
        responderBase: report.responderBase,
      });

      return {
        success: true,
        report,
        message: 'Incident details retrieved successfully',
      };
    } else {
      return {
        success: false,
        report: {} as EmergencyReport,
        message: response.error || 'Failed to fetch incident details',
      };
    }
  } catch (error) {
    console.warn('Error fetching incident details:', error);
    return {
      success: false,
      report: {} as EmergencyReport,
      message: 'Network error occurred while fetching incident details',
    };
  }
};

// Upload media file (video/audio) for reports
export const uploadMediaFile = async (
  fileUri: string,
  fileType: 'video' | 'audio',
  reportId: string
): Promise<{ success: boolean; mediaUrl?: string; message: string }> => {
  try {
    console.log(`[REAL API] Uploading ${fileType} file for report: ${reportId}`);
    
    // Create FormData for file upload
    const formData = new FormData();
    formData.append('file', {
      uri: fileUri,
      type: fileType === 'video' ? 'video/mp4' : 'audio/mp4',
      name: `${reportId}_${fileType}.${fileType === 'video' ? 'mp4' : 'm4a'}`,
    } as any);
    formData.append('reportId', reportId);
    formData.append('fileType', fileType);

    const response = await fetch(`${API_BASE_URL}/media/upload`, {
      method: 'POST',
      body: formData,
      // Do NOT set Content-Type explicitly; let fetch set the boundary for multipart
      headers: apiClient['authToken']
        ? { Authorization: `Bearer ${apiClient['authToken']}` }
        : undefined,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.success) {
      return {
        success: true,
        mediaUrl: data.mediaUrl,
        message: 'Media file uploaded successfully',
      };
    } else {
      return {
        success: false,
        message: data.error || 'Failed to upload media file',
      };
    }
  } catch (error) {
    // changed: warn instead of error to reduce LogBox noise
    console.warn('Error uploading media file:', error);
    return {
      success: false,
      message: 'Network error occurred while uploading media file',
    };
  }
};

// Get dispatcher information for an incident
export const getDispatcherInfo = async (incidentId: string): Promise<{
  success: boolean;
  dispatcher?: EmergencyReport['assignedDispatcher'];
  message: string;
}> => {
  try {
    console.log(`[REAL API] Fetching dispatcher info for incident: ${incidentId}`);
    
    const response = await apiClient.get<EmergencyReport['assignedDispatcher']>(`/incidents/${incidentId}/dispatcher`);
    
    if (response.success && response.data) {
      return {
        success: true,
        dispatcher: response.data,
        message: 'Dispatcher information retrieved successfully',
      };
    } else {
      return {
        success: false,
        message: response.error || 'Failed to fetch dispatcher information',
      };
    }
  } catch (error) {
    console.error('Error fetching dispatcher info:', error);
    return {
      success: false,
      message: 'Network error occurred while fetching dispatcher information',
    };
  }
};

// Set API base URL for different environments
export const setApiBaseUrl = (url: string) => {
  apiClient['baseURL'] = url;
};

// Get current API base URL
export const getApiBaseUrl = () => {
  return apiClient['baseURL'];
};

// Connectivity check to quickly validate base URL and network reachability
export const pingApi = async (): Promise<{ ok: boolean; url: string; error?: string }> => {
  const testUrl = `${API_BASE_URL.replace(/\/api\/?$/, '')}/health`;
  console.log(`[API CLIENT] Testing connection to: ${testUrl}`);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const res = await fetch(testUrl, { 
      method: 'GET',
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (res.ok) {
      const data = await res.json();
      console.log(`[API CLIENT] ✅ Connection successful:`, data);
      return { ok: true, url: testUrl };
    } else {
      return { ok: false, url: testUrl, error: `HTTP ${res.status}` };
    }
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : 'Unknown error';
    console.warn(`[API CLIENT] ❌ Connection test failed:`, errorMsg);
    
    if (errorMsg.includes('Network request failed') || errorMsg.includes('Failed to fetch')) {
      return { 
        ok: false, 
        url: testUrl, 
        error: `Cannot reach backend server. Make sure:\n1. Backend is running (cd backend && node server.js)\n2. IP address matches: ${API_BASE_URL}\n3. Firewall allows port 3000` 
      };
    }
    
    return { ok: false, url: testUrl, error: errorMsg };
  }
};

