/**
 * How a dispatch assignment is worded on the incident card (UC-15).
 *
 * Kept apart from the component and free of imports so the rules for missing
 * data can be read, and tested, without a database or a screen. The directory
 * holds placeholder records -- a dash for a name, no office -- and each of
 * those has to come out as something a responder can read rather than as a
 * blank or a stray punctuation mark.
 */

/** A row of public.dispatch, as far as the card uses it. */
export type DispatchRow = {
  id: string;
  incident_id: string;
  responder_id: string | null;
  status: string | null;
  assigned_at: string | null;
  dispatched_at: string | null;
  /** dispatch keeps its own copy of these two, beside the responder record. */
  responder_phone_number: string | null;
  service_type: string | null;
};

/** A row of public.responders, as far as the card uses it. */
export type ResponderRow = {
  responder_id: string;
  name: string | null;
  office: string | null;
  service_type: string | null;
  responder_phone_number: string | null;
};

export type Assignment = {
  dispatch: DispatchRow;
  /**
   * Null when dispatch names no responder, or names one whose entry in the
   * directory no longer exists.
   */
  responder: ResponderRow | null;
};

const SERVICE_LABELS: Record<string, string> = {
  fire: 'Fire',
  medical: 'Medical',
  police: 'Police',
};

function clean(value: string | null | undefined): string {
  return (value ?? '').trim();
}

function serviceLabel(serviceType: string | null | undefined): string {
  const key = clean(serviceType).toLowerCase();
  if (!key) return '';
  return SERVICE_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

export function assignedName(assignment: Assignment): string {
  const { dispatch, responder } = assignment;
  // Assigned to a responder whose directory entry is gone. That is a fault in
  // the data, and "Name not set" would pass it off as a blank field.
  if (!responder && dispatch.responder_id) return 'Responder record not found';
  const name = clean(responder?.name);
  return !name || name === '-' ? 'Name not set' : name;
}

/** The office if there is one, otherwise the service the responder belongs to. */
export function assignedUnit(assignment: Assignment): string {
  const { dispatch, responder } = assignment;
  return (
    clean(responder?.office) ||
    serviceLabel(responder?.service_type) ||
    serviceLabel(dispatch.service_type) ||
    'Not set'
  );
}

export function assignedContact(assignment: Assignment): string {
  const { dispatch, responder } = assignment;
  return clean(responder?.responder_phone_number) || clean(dispatch.responder_phone_number) || 'Not set';
}

export function dispatchStatusLabel(status: string | null | undefined): string {
  const text = clean(status).replace(/_/g, ' ');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Not set';
}

/**
 * Always Manila time, whatever clock the browser is set to: the incident is
 * in Makati and the people reading this are coordinating there.
 */
export function formatManilaTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function dispatchTimeLine(dispatch: DispatchRow): string {
  const dispatched = formatManilaTime(dispatch.dispatched_at);
  if (dispatched) return `Dispatched ${dispatched} (Manila time)`;
  const assigned = formatManilaTime(dispatch.assigned_at);
  if (assigned) return `Assigned ${assigned} (Manila time), not dispatched yet`;
  return 'Not dispatched yet';
}

/** Newest first, so a reassignment shows above the one it replaced. */
export function sortAssignments(assignments: Assignment[]): Assignment[] {
  const when = (a: Assignment) => Date.parse(a.dispatch.dispatched_at ?? a.dispatch.assigned_at ?? '') || 0;
  return [...assignments].sort((a, b) => when(b) - when(a));
}
