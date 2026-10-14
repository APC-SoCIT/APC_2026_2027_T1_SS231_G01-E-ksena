import { supabase } from '@/lib/supabase';

/**
 * The dashboard's side of live tracking: the responder's trip to an incident,
 * kept on the incident's row in public.dispatch. The phone app follows that
 * row and shows the person who reported where their responder is.
 *
 * Each call returns null when it worked, or a message saying why not. Callers
 * show that message: a responder who believes the reporter can see them
 * coming, when the app was never told, is worse off than one who knows.
 */

const MISSING =
  /dispatch_accept|dispatch_report_position|dispatch_set_status|schema cache|could not find the function/i;

function explain(message: string): string {
  return MISSING.test(message)
    ? `${message} Run supabase/dispatch-live-tracking.sql in the Supabase SQL Editor.`
    : message;
}

/** Accept: the incidents behind these reports are this responder's trip now, under way. */
export async function startTrip(reportIds: string[]): Promise<string | null> {
  const { error } = await supabase.rpc('dispatch_accept', { report_ids: reportIds });
  return error ? explain(error.message) : null;
}

/** Arrived, or Done. */
export async function setTripStatus(reportIds: string[], status: 'arrived' | 'resolved'): Promise<string | null> {
  const { error } = await supabase.rpc('dispatch_set_status', { report_ids: reportIds, new_status: status });
  return error ? explain(error.message) : null;
}

/** Where the responder is now, written to every trip of theirs still under way. */
export async function shareTripPosition(lat: number, lng: number): Promise<string | null> {
  const { error } = await supabase.rpc('dispatch_report_position', { p_lat: lat, p_lng: lng });
  return error ? explain(error.message) : null;
}

/** At most this often, so a moving responder is not a stream of writes. */
export const SHARE_EVERY_MS = 10000;

/** Movement smaller than this is not worth telling anyone about. */
export const SHARE_MIN_MOVE_KM = 0.015;
