import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { supabase } from '@/lib/supabase';
import { emergencyTypeLabel } from '@/lib/emergency';
import { Spacing, FontSizes, Radius, TEXT_SECONDARY, DANGER, DANGER_BG, DANGER_BORDER } from '@/constants/theme';

/** At or above this the AI's call is trusted; below it a person must verify it (S-05). */
export const CONFIDENCE_THRESHOLD = 0.85;

type AiRow = { report_id: string; detected_type: string | null; confidence: number | string | null };

/** The model reports 0 to 1; a value above 1 is taken to be a percentage already. */
function asFraction(value: number | string | null): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  return n > 1 ? n / 100 : n;
}

/**
 * The AI's classification and confidence for the reports behind a card, with
 * a warning when any of them is below the threshold. A grouped card shows the
 * lowest confidence among its reports: the one that most needs checking.
 */
export function AiResult({ reportIds }: { reportIds: string[] }) {
  const key = reportIds.join(',');
  const [rows, setRows] = useState<AiRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ids = key ? key.split(',') : [];
    if (ids.length === 0) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setRows(null);
    setError(null);
    supabase.rpc('report_ai_results', { report_ids: ids }).then(({ data, error: rpcError }) => {
      if (cancelled) return;
      if (rpcError) {
        const missing = /report_ai_results|schema cache/i.test(rpcError.message);
        setError(
          missing
            ? `${rpcError.message} Run supabase/ai-results-and-dispatch-cancel.sql in the Supabase SQL Editor.`
            : rpcError.message
        );
        return;
      }
      setRows((data ?? []) as AiRow[]);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  if (error) return <Text style={styles.error}>Could not load the AI result: {error}</Text>;
  if (rows === null) return <Text style={styles.line}>Loading the AI result…</Text>;

  const scored = rows
    .map((row) => ({ type: row.detected_type, confidence: asFraction(row.confidence) }))
    .filter((row): row is { type: string | null; confidence: number } => row.confidence !== null);
  if (scored.length === 0) {
    return <Text style={styles.line}>AI classification: no confidence score on record for this report.</Text>;
  }

  const lowest = scored.reduce((min, row) => (row.confidence < min.confidence ? row : min));
  const percent = Math.round(lowest.confidence * 100);
  const needsCheck = lowest.confidence < CONFIDENCE_THRESHOLD;

  return (
    <View>
      <Text style={styles.line}>
        AI classification: {emergencyTypeLabel(lowest.type ?? undefined) || 'Unclassified'} · {percent}% confidence
      </Text>
      {needsCheck ? (
        <View style={styles.flag}>
          <Text style={styles.flagTitle}>Needs human verification</Text>
          <Text style={styles.flagText}>
            The AI is less than {Math.round(CONFIDENCE_THRESHOLD * 100)}% sure of this classification. Check the video
            before dispatching.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  line: { fontSize: FontSizes.sm, color: TEXT_SECONDARY, marginTop: Spacing.xs },
  error: { fontSize: FontSizes.sm, color: DANGER, marginTop: Spacing.xs },
  flag: {
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: DANGER_BORDER,
    backgroundColor: DANGER_BG,
  },
  flagTitle: { fontSize: FontSizes.sm, fontWeight: '700', color: DANGER },
  flagText: { fontSize: FontSizes.xs, color: DANGER, marginTop: 2 },
});
