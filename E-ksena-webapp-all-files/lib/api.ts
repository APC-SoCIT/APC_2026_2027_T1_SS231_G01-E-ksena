import { API_URL, API_KEY } from './env';

/**
 * Low-level fetch wrapper for the E-ksena backend.
 * Automatically attaches the Content-Type and X-API-Key headers.
 * Throws an error if the response is not ok.
 */
async function backendFetch(path: string, options: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  const json = await res.json();

  if (!res.ok) {
    throw new Error(
      (json as { error?: string }).error ?? `Backend request failed (${res.status})`
    );
  }

  return json;
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export type CreateReportInput = {
  title: string;
  content: string;
  /** Optional — pass the logged-in user's ID to link the report to their account */
  userId?: string;
};

export type ReportRecord = {
  id: string;
  title: string;
  content: string;
  user_id?: string | null;
  created_at?: string;
};

export type CreateReportResponse = {
  success: boolean;
  message: string;
  data: ReportRecord[];
};

/**
 * Creates a new report/ticket via the backend.
 * Uses the privileged service-role Supabase client on the server side.
 */
export async function createReport(input: CreateReportInput): Promise<CreateReportResponse> {
  return backendFetch('/api/reports', {
    method: 'POST',
    body: JSON.stringify({
      title: input.title,
      content: input.content,
      ...(input.userId ? { user_id: input.userId } : {}),
    }),
  }) as Promise<CreateReportResponse>;
}

// ---------------------------------------------------------------------------
// Messages (SMS)
// ---------------------------------------------------------------------------

export type SendMessageInput = {
  recipientPhone: string;
  body: string;
};

export type SendMessageResponse = {
  success: boolean;
  message: string;
};

/**
 * Logs and dispatches an SMS message via the backend.
 */
export async function sendMessage(input: SendMessageInput): Promise<SendMessageResponse> {
  return backendFetch('/api/messages', {
    method: 'POST',
    body: JSON.stringify({
      recipient_phone: input.recipientPhone,
      body: input.body,
    }),
  }) as Promise<SendMessageResponse>;
}
