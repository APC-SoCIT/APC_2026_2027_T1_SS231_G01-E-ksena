import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { supabase } from '@/lib/supabase';
import {
  type Assignment,
  type DispatchRow,
  type ResponderRow,
  assignedName,
  assignedUnit,
  assignedContact,
  dispatchStatusLabel,
  dispatchTimeLine,
  sortAssignments,
} from '@/lib/assignment-display';
import { Spacing, FontSizes, TEXT_PRIMARY, TEXT_SECONDARY, OFF_WHITE, BORDER, Radius, DANGER } from '@/constants/theme';

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; assignments: Assignment[] };

/** One row from public.incident_assignments. */
type AssignmentRecord = {
  dispatch_id: string;
  incident_id: string;
  responder_id: string | null;
  status: string | null;
  assigned_at: string | null;
  dispatched_at: string | null;
  dispatch_phone_number: string | null;
  dispatch_service_type: string | null;
  responder_found: boolean;
  responder_name: string | null;
  responder_office: string | null;
  responder_service_type: string | null;
  responder_phone_number: string | null;
};

// Asked through a database function, not read from the tables. A signed-in
// responder may read neither of them: dispatch has no read rule at all, and
// the directory gives each responder their own entry only. The function hands
// back the assignment for incidents the caller's service handles and nothing
// for any other, which is all this card needs.
async function loadAssignments(incidentIds: string[]): Promise<Assignment[]> {
  const { data, error } = await supabase.rpc('incident_assignments', { incident_ids: incidentIds });
  if (error) {
    const missing = /incident_assignments|schema cache/i.test(error.message);
    throw new Error(
      missing
        ? `${error.message} Run supabase/incident-assignments-function.sql in the Supabase SQL Editor.`
        : error.message
    );
  }
  const records = (data ?? []) as AssignmentRecord[];
  return sortAssignments(
    records.map((record) => {
      const dispatch: DispatchRow = {
        id: record.dispatch_id,
        incident_id: record.incident_id,
        responder_id: record.responder_id,
        status: record.status,
        assigned_at: record.assigned_at,
        dispatched_at: record.dispatched_at,
        responder_phone_number: record.dispatch_phone_number,
        service_type: record.dispatch_service_type,
      };
      const responder: ResponderRow | null =
        record.responder_found && record.responder_id
          ? {
              responder_id: record.responder_id,
              name: record.responder_name,
              office: record.responder_office,
              service_type: record.responder_service_type,
              responder_phone_number: record.responder_phone_number,
            }
          : null;
      return { dispatch, responder };
    })
  );
}

type Props = {
  /** Every incident behind the card. A grouped card stands for several. */
  incidentIds: string[];
  /** Changes when the report does, so an Accept or a handoff is picked up. */
  refreshKey?: string;
};

/** How often an open card asks again, so a new assignment shows up unprompted. */
const REFRESH_MS = 15000;

/**
 * Who has been assigned to an incident, for the dispatch details in UC-15.
 *
 * An empty answer is shown as "Not yet assigned". The database gives the same
 * empty answer for an incident the caller's service does not handle, but the
 * card is only ever opened for incidents it does.
 */
export function AssignedResponder({ incidentIds, refreshKey }: Props) {
  const incidentKey = incidentIds.join(',');
  const [state, setState] = useState<LoadState>({ phase: 'loading' });
  const [tick, setTick] = useState(0);
  const shownFor = useRef<string | null>(null);

  useEffect(() => {
    const ids = incidentKey ? incidentKey.split(',') : [];
    if (ids.length === 0) {
      // A report taken by phone has no incident, so nothing can be assigned to it.
      shownFor.current = incidentKey;
      setState({ phase: 'ready', assignments: [] });
      return;
    }
    let cancelled = false;
    // The loading line is for a different incident only. Refreshing the one
    // already on screen swaps the answer in quietly, without a flicker.
    if (shownFor.current !== incidentKey) setState({ phase: 'loading' });
    loadAssignments(ids).then(
      (assignments) => {
        if (cancelled) return;
        shownFor.current = incidentKey;
        setState({ phase: 'ready', assignments });
      },
      (err: unknown) => {
        if (cancelled) return;
        const message =
          err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err);
        // A failure is reported as a failure. Falling back to "Not yet
        // assigned" here would tell a responder nobody is coming when the
        // truth is that the dashboard could not find out.
        setState({ phase: 'error', message });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [incidentKey, refreshKey, tick]);

  // Asked again on a timer because nothing announces a new assignment to this
  // screen: live updates only reach accounts allowed to read the table, and
  // responders are not.
  useEffect(() => {
    if (!incidentKey) return;
    const timer = setInterval(() => setTick((count) => count + 1), REFRESH_MS);
    return () => clearInterval(timer);
  }, [incidentKey]);

  return (
    <View style={styles.box}>
      <Text style={styles.label}>ASSIGNED RESPONDER</Text>

      {state.phase === 'loading' ? <Text style={styles.muted}>Checking who is assigned…</Text> : null}

      {state.phase === 'error' ? (
        <Text style={styles.error}>Could not load the assignment: {state.message}</Text>
      ) : null}

      {state.phase === 'ready' && state.assignments.length === 0 ? (
        <Text style={styles.muted}>Not yet assigned</Text>
      ) : null}

      {state.phase === 'ready'
        ? state.assignments.map((assignment, index) => (
            <View key={assignment.dispatch.id} style={index > 0 ? styles.another : undefined}>
              <Row name="Name" value={assignedName(assignment)} />
              <Row name="Unit" value={assignedUnit(assignment)} />
              <Row name="Contact" value={assignedContact(assignment)} />
              <Row name="Status" value={dispatchStatusLabel(assignment.dispatch.status)} />
              <Text style={styles.time}>{dispatchTimeLine(assignment.dispatch)}</Text>
            </View>
          ))
        : null}
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
