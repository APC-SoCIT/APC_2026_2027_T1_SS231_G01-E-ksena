import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { supabase } from '@/lib/supabase';
import { formatManilaTime } from '@/lib/reporter-display';
import { Spacing, FontSizes, Radius, BORDER, WHITE, TEXT_PRIMARY, TEXT_SECONDARY, DANGER } from '@/constants/theme';

type AuditRow = {
  id: number;
  occurred_at: string;
  actor_username: string | null;
  actor_role: string | null;
  action: string;
  previous_value: string | null;
  new_value: string | null;
  report_count: number | null;
  detail: Record<string, unknown> | null;
};

const ACTION_LABELS: Record<string, string> = {
  status_change: 'Status changed',
  reassign: 'Reassigned',
  video_delete: 'Video deleted',
  dispatch_cancel: 'Dispatch cancelled',
  incident_submitted: 'Incident submitted',
  ai_result: 'AI result',
};

/** The line under the action's name. An AI result reads better as type and score than as a before and after. */
function changeText(row: AuditRow): string {
  if (row.action === 'ai_result') {
    const raw = row.detail?.confidence;
    const n = typeof raw === 'number' || typeof raw === 'string' ? Number(raw) : NaN;
    const percent = Number.isNaN(n) ? '' : ` · ${Math.round(n > 1 ? n : n * 100)}% confidence`;
    return `: ${row.new_value ?? 'unclassified'}${percent}`;
  }
  if (row.action === 'incident_submitted') {
    const id = row.detail?.incident_id;
    return typeof id === 'string' ? `: incident ${id.slice(0, 8)}` : '';
  }
  return row.previous_value || row.new_value ? `: ${row.previous_value ?? '—'} → ${row.new_value ?? '—'}` : '';
}

const LIMIT = 50;

/**
 * The newest entries of the dispatch audit log: who did what to which
 * incident, and when. Read-only: the log has no rule that lets anyone edit
 * or delete an entry, so there is nothing to offer here but reading.
 */
export function AuditLogList() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: loadError } = await supabase
      .from('dispatch_audit_log')
      .select('id, occurred_at, actor_username, actor_role, action, previous_value, new_value, report_count, detail')
      .order('occurred_at', { ascending: false })
      .limit(LIMIT);
    if (loadError) {
      setError(loadError.message);
      setRows([]);
      return;
    }
    setRows((data ?? []) as AuditRow[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View>
      <View style={styles.headRow}>
        <Text style={styles.title}>Audit Log (latest {LIMIT})</Text>
        <Pressable onPress={load} style={styles.refreshBtn} accessibilityRole="button" accessibilityLabel="Refresh the audit log">
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>Could not load the audit log: {error}</Text> : null}
      {rows === null ? <Text style={styles.muted}>Loading…</Text> : null}
      {rows && rows.length === 0 && !error ? <Text style={styles.muted}>No actions recorded yet.</Text> : null}
      {(rows ?? []).map((row) => (
        <View key={row.id} style={styles.entry}>
          <Text style={styles.entryTitle}>
            {ACTION_LABELS[row.action] ?? row.action}
            {changeText(row)}
          </Text>
          <Text style={styles.entryDetail}>
            {formatManilaTime(row.occurred_at) ?? row.occurred_at} (Manila time) · {row.actor_username ?? 'Unknown'}
            {row.actor_role ? ` (${row.actor_role})` : ''}
            {row.report_count ? ` · ${row.report_count} report${row.report_count === 1 ? '' : 's'}` : ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  title: { fontSize: FontSizes.body, fontWeight: '600', color: TEXT_PRIMARY },
  refreshBtn: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.md,
    backgroundColor: WHITE,
  },
  refreshText: { fontSize: FontSizes.sm, fontWeight: '600', color: TEXT_PRIMARY },
  muted: { fontSize: FontSizes.sm, color: TEXT_SECONDARY, paddingVertical: Spacing.sm },
  error: { fontSize: FontSizes.sm, color: DANGER, marginBottom: Spacing.sm },
  entry: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  entryTitle: { fontSize: FontSizes.sm, fontWeight: '600', color: TEXT_PRIMARY },
  entryDetail: { fontSize: FontSizes.xs, color: TEXT_SECONDARY, marginTop: 2 },
});
