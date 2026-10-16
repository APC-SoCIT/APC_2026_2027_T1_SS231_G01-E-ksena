import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { supabase } from '@/lib/supabase';
import {
  type ReportRef,
  type ReporterRecord,
  groupReporters,
  reportedLine,
  reporterContact,
  reporterName,
} from '@/lib/reporter-display';
import { Spacing, FontSizes, TEXT_PRIMARY, TEXT_SECONDARY, OFF_WHITE, BORDER, Radius, DANGER } from '@/constants/theme';

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; records: ReporterRecord[] };

// Asked through a database function, not read from the tables. A signed-in
// responder may read neither a citizen's profile nor the incident a report
// came from. The function hands back a name and a number for reports the
// caller's service handles and nothing for any other, which is all this card
// needs.
async function loadReporters(reportIds: string[]): Promise<ReporterRecord[]> {
  const { data, error } = await supabase.rpc('report_reporters', { report_ids: reportIds });
  if (error) {
    const missing = /report_reporters|schema cache/i.test(error.message);
    throw new Error(
      missing
        ? `${error.message} Run supabase/report-reporters-function.sql in the Supabase SQL Editor.`
        : error.message
    );
  }
  return (data ?? []) as ReporterRecord[];
}

type Props = {
  /** Every report behind the card. A grouped card stands for several. */
  reports: ReportRef[];
};

/**
 * Who reported an emergency: the name and number a responder needs to reach
 * them. A grouped card lists each person once, however many reports they
 * filed.
 */
export function ReporterDetails({ reports }: Props) {
  const reportKey = reports.map((report) => report.id).join(',');
  const [state, setState] = useState<LoadState>({ phase: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const shownFor = useRef<string | null>(null);

  useEffect(() => {
    const ids = reportKey ? reportKey.split(',') : [];
    if (ids.length === 0) {
      shownFor.current = reportKey;
      setState({ phase: 'ready', records: [] });
      return;
    }
    let cancelled = false;
    // The loading line is for a different card only. The same card being
    // drawn again keeps what it already shows.
    if (shownFor.current !== reportKey) setState({ phase: 'loading' });
    loadReporters(ids).then(
      (records) => {
        if (cancelled) return;
        shownFor.current = reportKey;
        setState({ phase: 'ready', records });
      },
      (err: unknown) => {
        if (cancelled) return;
        const message =
          err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err);
        // A failure is reported as a failure. Saying nothing is known about
        // the reporter, when the truth is that the dashboard could not find
        // out, would send a responder off without a number that exists.
        setState({ phase: 'error', message });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [reportKey, attempt]);

  const reporters = state.phase === 'ready' ? groupReporters(state.records, reports) : [];

  return (
    <View style={styles.box}>
      <Text style={styles.label}>{reporters.length > 1 ? 'REPORTERS' : 'REPORTER'}</Text>

      {state.phase === 'loading' ? <Text style={styles.muted}>Looking up who reported this…</Text> : null}

      {state.phase === 'error' ? (
        <View>
          <Text style={styles.error}>Could not load the reporter: {state.message}</Text>
          <Pressable
            onPress={() => {
              shownFor.current = null;
              setAttempt((n) => n + 1);
            }}
            style={styles.retryBtn}
            accessibilityRole="button"
            accessibilityLabel="Try loading the reporter again"
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {state.phase === 'ready' && reporters.length === 0 ? (
        <Text style={styles.muted}>No reporter details are on record for this report.</Text>
      ) : null}

      {reporters.map((reporter, index) => (
        <View key={reporter.key} style={index > 0 ? styles.another : undefined}>
          <Row name="Name" value={reporterName(reporter)} />
          <Row name="Contact" value={reporterContact(reporter)} />
          <Text style={styles.time}>{reportedLine(reporter)}</Text>
        </View>
      ))}
    </View>
  );
}

function Row({ name, value }: { name: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowName}>{name}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: OFF_WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  label: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: TEXT_SECONDARY,
    marginBottom: Spacing.sm,
  },
  muted: {
    fontSize: FontSizes.sm,
    color: TEXT_SECONDARY,
  },
  error: {
    fontSize: FontSizes.sm,
    color: DANGER,
    lineHeight: 20,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    marginTop: Spacing.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.md,
  },
  retryText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: TEXT_PRIMARY,
  },
  another: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  rowName: {
    width: 64,
    fontSize: FontSizes.sm,
    color: TEXT_SECONDARY,
  },
  rowValue: {
    flex: 1,
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: TEXT_PRIMARY,
  },
  time: {
    fontSize: FontSizes.xs,
    color: TEXT_SECONDARY,
    marginTop: Spacing.xs,
  },
});
