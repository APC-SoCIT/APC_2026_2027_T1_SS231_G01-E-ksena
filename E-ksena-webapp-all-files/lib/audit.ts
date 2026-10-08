import { supabase } from '@/lib/supabase';

export type DispatchAuditEntry = {
  action: 'status_change' | 'reassign';
  previousValue?: string | null;
  newValue?: string | null;
  reportIds: string[];
  detail?: Record<string, unknown>;
};

export type AuditActor = {
  username?: string | null;
  role?: string | null;
};

const MISSING_TABLE =
  /relation .*dispatch_audit_log.* does not exist|could not find the table|schema cache/i;

/**
 * Appends one dispatch action to the audit trail.
 *
 * Returns null on success, or a message describing why the entry could not be
 * written. Callers surface that message instead of discarding it: an audit
 * trail that fails quietly is worse than none, because it still looks complete.
 * The dispatch itself is never rolled back - losing the record is preferable to
 * blocking an emergency response.
 */
export async function recordDispatchAction(
  entry: DispatchAuditEntry,
  actor: AuditActor
): Promise<string | null> {
  const { data, error: userError } = await supabase.auth.getUser();
  if (userError || !data.user) return 'no signed-in account to attribute the action to';

  const { error } = await supabase.from('dispatch_audit_log').insert([
    {
      actor_auth_id: data.user.id,
      actor_username: actor.username ?? null,
      actor_role: actor.role ?? null,
      action: entry.action,
      previous_value: entry.previousValue ?? null,
      new_value: entry.newValue ?? null,
      report_ids: entry.reportIds,
      report_count: entry.reportIds.length,
      detail: entry.detail ?? {},
    },
  ]);
  if (!error) return null;

  return MISSING_TABLE.test(error.message)
    ? 'the audit log table does not exist yet - run supabase/dispatch-audit-log.sql in the Supabase SQL Editor'
    : error.message;
}
