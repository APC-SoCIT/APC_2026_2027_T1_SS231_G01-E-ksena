/**
 * How a reporter is worded on the incident card.
 *
 * Kept apart from the component and free of imports so the rules for missing
 * data can be read, and tested, without a database or a screen. A citizen's
 * profile may have no name, and an incident may carry no usable number; each
 * of those has to come out as something a responder can read rather than as a
 * blank.
 */

/** One row from public.report_reporters. */
export type ReporterRecord = {
  report_id: string;
  reporter_name: string | null;
  reporter_phone: string | null;
};

/** What the card knows about each report behind it. */
export type ReportRef = {
  id: string;
  timestamp?: string | null;
};

/** One person on the card. Several reports from the same person are one entry. */
export type Reporter = {
  key: string;
  name: string | null;
  phone: string | null;
  /** When they first reported. */
  reportedAt: string | null;
  /** How many of the reports behind the card are theirs. */
  reports: number;
};

function clean(value: string | null | undefined): string {
  return (value ?? '').trim();
}

export function reporterName(reporter: Reporter): string {
  return reporter.name ?? 'Name not on record';
}

export function reporterContact(reporter: Reporter): string {
  return reporter.phone ?? 'No number on record';
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

export function reportedLine(reporter: Reporter): string {
  const when = formatManilaTime(reporter.reportedAt);
  const count = reporter.reports > 1 ? `, ${reporter.reports} reports` : '';
  return when ? `Reported ${when} (Manila time)${count}` : `Report time not recorded${count}`;
}

/**
 * Folds the records behind a card into the people who made them, earliest
 * first.
 *
 * Two reports are taken to be the same person when they carry the same
 * number, or, with no number, the same name. A report with neither stays on
 * its own: two people nothing is known about are still two people.
 */
export function groupReporters(records: ReporterRecord[], refs: ReportRef[]): Reporter[] {
  const timeOf = new Map(refs.map((ref) => [ref.id, ref.timestamp ?? null]));
  const byKey = new Map<string, Reporter>();

  for (const record of records) {
    const name = clean(record.reporter_name) || null;
    const phone = clean(record.reporter_phone) || null;
    const digits = (phone ?? '').replace(/\D/g, '');
    const key = digits ? `phone:${digits}` : name ? `name:${name.toLowerCase()}` : `report:${record.report_id}`;
    const reportedAt = timeOf.get(record.report_id) ?? null;

    const known = byKey.get(key);
    if (!known) {
      byKey.set(key, { key, name, phone, reportedAt, reports: 1 });
      continue;
    }
    known.reports += 1;
    known.name = known.name ?? name;
    if (reportedAt && (!known.reportedAt || Date.parse(reportedAt) < Date.parse(known.reportedAt))) {
      known.reportedAt = reportedAt;
    }
  }

  const when = (reporter: Reporter) => Date.parse(reporter.reportedAt ?? '') || Number.MAX_SAFE_INTEGER;
  return [...byKey.values()].sort((a, b) => when(a) - when(b));
}
