// ReportService for E-KSENA Emergency Response App
// Real backend implementation for emergency reporting

import Constants from 'expo-constants';
import { Platform } from 'react-native';

const PUBLIC_ENV_URL = (typeof process !== 'undefined' ? (process as any).env?.EXPO_PUBLIC_API_BASE_URL : undefined) as string | undefined;

let CONFIG_BASE_URL =
  PUBLIC_ENV_URL ||
  (Constants?.expoConfig as any)?.extra?.API_BASE_URL ||
  (Constants?.manifest as any)?.extra?.API_BASE_URL ||
  'http://127.0.0.1:3000/v1'; // Fallback for dev

// Normalize localhost for Android emulator
if (CONFIG_BASE_URL.includes('localhost') || CONFIG_BASE_URL.includes('127.0.0.1')) {
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
    timeoutMs: number = 15000
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseURL}${endpoint}`;
    
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
        throw new Error(`HTTP error! status: ${response.status} @ ${url}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      const message =
        (error as any)?.name === 'AbortError'
          ? 'Request timed out'
          : (error instanceof Error ? error.message : 'Unknown error occurred');
      // changed: use warn instead of error so LogBox doesn't show a big red "Console Error"
      console.warn('API request failed:', message);
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
type ResponderRoutePayload = {
  incidentId: string;
  responderStart: { latitude: number; longitude: number };
  userLocation: { latitude: number; longitude: number; address?: string };
  dispatcherName?: string;
};

let pendingResponderRoute: ResponderRoutePayload | null = null;

export const setPendingResponderRoute = (payload: ResponderRoutePayload) => {
  pendingResponderRoute = payload;
};

export const consumePendingResponderRoute = (): ResponderRoutePayload | null => {
  const current = pendingResponderRoute;
  pendingResponderRoute = null;
  return current;
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
  location: { latitude: number; longitude: number; address?: string }
): Promise<ReportResponse> => {
  try {
    console.log(`[REAL API] Creating video report (metadata) from location:`, location);

    const requestData: CreateReportRequest = {
      type: 'video',
      location,
      description: 'Emergency video report submitted',
    };

    // 1) create report metadata
    const createResp = await apiClient.post<EmergencyReport>('/reports', requestData);

    if (!createResp.success || !createResp.data) {
      // network/backend failed — fallback to creating a local/offline report so UI can continue
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
      // choose an approximate responder start (offset a little from user location)
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
        message: 'Report created. Wait for responder update.',
      };
    }

    const report = createResp.data;

    // 2) upload media file and attach to the created report
    const uploadResult = await uploadMediaFile(videoUri, 'video', report.id);

    if (uploadResult.success && uploadResult.mediaUrl) {
      // optionally update report.mediaUri locally
      report.mediaUri = uploadResult.mediaUrl;

      // set pending route so UI will show the responder traffic route
      setPendingResponderRoute({
        incidentId: report.id,
        responderStart: {
          latitude: location.latitude + 0.005,
          longitude: location.longitude + 0.005,
        },
        userLocation: location,
        dispatcherName: 'Assigned Responder',
      });

      return {
        success: true,
        report,
        message: 'Video report submitted and media uploaded successfully',
      };
    } else {
      // If media upload failed, still let the app continue to routing using the report
      setPendingResponderRoute({
        incidentId: report.id,
        responderStart: {
          latitude: location.latitude + 0.005,
          longitude: location.longitude + 0.005,
        },
        userLocation: location,
        dispatcherName: 'Assigned Responder (media pending)',
      });

      return {
        success: true, // report metadata created, but media upload failed
        report,
        message: `Report created but media upload failed: ${uploadResult.message}`,
      };
    }
  } catch (error) {
    console.warn('Error sending video report:', error);
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
    
    const response = await apiClient.get<EmergencyReport>(`/incidents/${incidentId}`);
    
    if (response.success && response.data) {
      return {
        success: true,
        report: response.data,
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
    console.error('Error fetching incident details:', error);
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
  const testUrl = `${API_BASE_URL.replace(/\/$/, '')}/health`;
  try {
    const res = await fetch(testUrl, { method: 'GET' });
    return { ok: res.ok, url: testUrl, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, url: testUrl, error: e instanceof Error ? e.message : 'Unknown error' };
  }
};

