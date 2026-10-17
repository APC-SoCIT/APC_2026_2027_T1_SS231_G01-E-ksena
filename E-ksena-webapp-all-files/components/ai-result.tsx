import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { supabase } from '@/lib/supabase';
import { emergencyTypeLabel } from '@/lib/emergency';
import { Spacing, FontSizes, Radius, TEXT_SECONDARY, DANGER, DANGER_BG, DANGER_BORDER } from '@/constants/theme';

/** At or above this the AI's call is trusted; below it a person must verify it (S-05). */
export const CONFIDENCE_THRESHOLD = 0.85;

/**
 * Below this the report is not actionable at all until a responder has
 * watched the video and confirmed it (TC_W_AI_04): it is listed apart from
 * the active emergencies and cannot be accepted straight away.
 */
export const ACTIONABLE_THRESHOLD = 0.6;

type AiRow = { report_id: string; detected_type: string | null; confidence: number | string | null };

/** The model reports 0 to 1; a value above 1 is taken to be a percentage already. */
function asFraction(value: number | string | null): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  return n > 1 ? n / 100 : n;
}

/**
 * The AI's confidence for each of these reports, keyed by report id, for
 * sorting the list. A report with no score, or a lookup that fails, is simply
 * left out: missing data must never hold an emergency back from responders.
 */
export function useAiConfidence(reportIds: string[]): Record<string, number> {
  const key = [...reportIds].sort().join(',');
  const [scores, setScores] = useState<Record<string, number>>({});

  useEffect(() => {
    const ids = key ? key.split(',') : [];
    if (ids.length === 0) {
      setScores({});
      return;
    }
    let cancelled = false;
    supabase.rpc('report_ai_results', { report_ids: ids }).then(({ data, error }) => {
      if (cancelled || error) return;
      const next: Record<string, number> = {};
      for (const row of (data ?? []) as AiRow[]) {
        const confidence = asFraction(row.confidence);
        if (confidence !== null) next[row.report_id] = confidence;
      }
      setScores(next);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return scores;
}

/**
 * The AI's classification and confidence for the reports behind a card, with
 * a warning when any of them is below the threshold. A grouped card shows the
 * lowest confidence among its reports: the one that most needs checking.
 * `held` marks a card the Map is holding back from dispatch (below 60%, not
 * yet confirmed), which gets a stronger warning.
 */
export function AiResult({ reportIds, held = false }: { reportIds: string[]; held?: boolean }) {
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
  // Whether the card is held back is the Map's call (it also knows whether a
  // responder has confirmed it), so the box follows `held` rather than the score.
  const notActionable = held;

  return (
    <View>
      <Text style={styles.line}>
        AI classification: {emergencyTypeLabel(lowest.type ?? undefined) || 'Unclassified'} · {percent}% confidence
      </Text>
      {notActionable ? (
        <View style={styles.flag}>
          <Text style={styles.flagTitle}>Low confidence: not actionable yet</Text>
          <Text style={styles.flagText}>
            The AI is less than {Math.round(ACTIONABLE_THRESHOLD * 100)}% sure of this classification, so it is held
            back from dispatch. Watch the video, then confirm it is a real emergency before accepting it.
          </Text>
        </View>
      ) : needsCheck ? (
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
