import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { supabase } from '@/lib/supabase';
import { emergencyTypeLabel } from '@/lib/emergency';
import { formatManilaTime } from '@/lib/reporter-display';
import { Spacing, FontSizes, Radius, BORDER, TEXT_PRIMARY, TEXT_SECONDARY, DANGER } from '@/constants/theme';

type TimelineRow = {
  occurred_at: string | null;
  kind: string;
  previous_value: string | null;
  new_value: string | null;
  actor: string | null;
  confidence: number | string | null;
};

function by(actor: string | null): string {
  return actor ? ` by ${actor}` : '';
}

function describe(row: TimelineRow): string {
  switch (row.kind) {
    case 'incident_submitted':
      return 'Reported from the citizen app';
    case 'report_logged':
      return 'Report logged from a phone call or SMS';
    case 'ai_result': {
      const n = Number(row.confidence);
      const percent = Number.isNaN(n) || row.confidence === null ? null : Math.round(n > 1 ? n : n * 100);
      return `AI classified it as ${emergencyTypeLabel(row.new_value)}${percent !== null ? ` (${percent}% confidence)` : ''}`;
    }
    case 'dispatch_cancel':
      return `Dispatch cancelled${by(row.actor)}`;
    case 'reassign':
      return `Handed to ${emergencyTypeLabel(row.new_value)}${by(row.actor)}`;
    case 'status_change':
      switch (row.new_value) {
        case 'responding':
          return `Accepted${by(row.actor)}`;
        case 'arrived':
          return `Arrived at the scene${by(row.actor)}`;
        case 'resolved':
          return `Closed${by(row.actor)}`;
        case 'verified':
          return `Confirmed as a real emergency${by(row.actor)}`;
        default:
          return `Status ${row.previous_value ?? '—'} → ${row.new_value ?? '—'}${by(row.actor)}`;
      }
    default:
      return row.kind;
  }
}

/**
 * What has happened to the emergency behind a card, oldest first, each with
 * its time (TC_W_Details_03): when it came in, what the AI made of it, and
 * every accept, arrival, cancel and close since.
 *
 * `refreshKey` is anything that changes when the card's status does, so the
 * list is read again after the responder acts.
 */
export function DispatchTimeline({ reportIds, refreshKey }: { reportIds: string[]; refreshKey: string }) {
  const key = reportIds.join(',');
  const [rows, setRows] = useState<TimelineRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ids = key ? key.split(',') : [];
    if (ids.length === 0) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setError(null);
    supabase.rpc('report_timeline', { report_ids: ids }).then(({ data, error: rpcError }) => {
      if (cancelled) return;
      if (rpcError) {
        const missing = /report_timeline|schema cache|could not find the function/i.test(rpcError.message);
        setError(
          missing
            ? `${rpcError.message} Run supabase/audit-and-timeline.sql in the Supabase SQL Editor.`
            : rpcError.message
        );
        setRows([]);
        return;
      }
      setRows((data ?? []) as TimelineRow[]);
    });
    return () => {
      cancelled = true;
    };
  }, [key, refreshKey]);

  return (
    <View style={styles.box}>
      <Text style={styles.label}>STATUS HISTORY (MANILA TIME)</Text>
      {error ? <Text style={styles.error}>Could not load the history: {error}</Text> : null}
      {rows === null ? <Text style={styles.muted}>Loading…</Text> : null}
      {rows && rows.length === 0 && !error ? <Text style={styles.muted}>Nothing recorded yet.</Text> : null}
      {(rows ?? []).map((row, i) => (
        <View key={`${row.kind}-${row.occurred_at}-${i}`} style={styles.row}>
          <Text style={styles.time}>{formatManilaTime(row.occurred_at) ?? 'Time not recorded'}</Text>
          <Text style={styles.text}>{describe(row)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: Spacing.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.md,
  },
  label: { fontSize: FontSizes.xs, fontWeight: '700', color: TEXT_SECONDARY, letterSpacing: 0.5, marginBottom: Spacing.xs },
  row: { flexDirection: 'row', gap: Spacing.sm, paddingVertical: 2 },
  time: { fontSize: FontSizes.xs, color: TEXT_SECONDARY, width: 130 },
  text: { flex: 1, fontSize: FontSizes.xs, color: TEXT_PRIMARY },
  muted: { fontSize: FontSizes.xs, color: TEXT_SECONDARY },
  error: { fontSize: FontSizes.xs, color: DANGER },
});
