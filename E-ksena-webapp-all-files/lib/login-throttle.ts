/**
 * Slows down repeated wrong passwords on the login screen (TC_W_Login_07).
 *
 * After MAX_FAILURES wrong passwords in a row for an email, the form is
 * locked for 30 seconds, and each further failure doubles that, up to 15
 * minutes. A correct login clears the count.
 *
 * This lives in the browser, so it is a brake on guessing at the screen, not
 * the security boundary: Supabase Auth limits sign-in attempts per address on
 * the server as well, and that limit is what a script talking to the API hits.
 * Only counts and times are stored, keyed by email, never a password.
 */

const STORE_KEY = 'eksena.loginFailures';
export const MAX_FAILURES = 5;
const BASE_LOCK_MS = 30_000;
const MAX_LOCK_MS = 15 * 60_000;

type Entry = { failures: number; lockedUntil: number };

function readAll(): Record<string, Entry> {
  try {
    const raw = globalThis.localStorage?.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Entry>) : {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, Entry>): void {
  try {
    globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify(all));
  } catch {
    // Private windows can refuse storage; the server-side limit still applies.
  }
}

function keyFor(email: string): string {
  return email.trim().toLowerCase();
}

/** The time this email's lock runs out, in ms since 1970, or 0 if it is not locked. */
export function lockedUntil(email: string): number {
  const entry = readAll()[keyFor(email)];
  return entry && entry.lockedUntil > Date.now() ? entry.lockedUntil : 0;
}

/** Counts one wrong password. Returns how many tries remain before a lock, and the lock's end if one began. */
export function recordFailure(email: string): { triesLeft: number; lockedUntil: number } {
  const all = readAll();
  const key = keyFor(email);
  const entry = all[key] ?? { failures: 0, lockedUntil: 0 };
  entry.failures += 1;
  if (entry.failures >= MAX_FAILURES) {
    const lockMs = Math.min(BASE_LOCK_MS * 2 ** (entry.failures - MAX_FAILURES), MAX_LOCK_MS);
    entry.lockedUntil = Date.now() + lockMs;
  }
  all[key] = entry;
  writeAll(all);
  return {
    triesLeft: Math.max(0, MAX_FAILURES - entry.failures),
    lockedUntil: entry.failures >= MAX_FAILURES ? entry.lockedUntil : 0,
  };
}

/** After a correct login. */
export function clearFailures(email: string): void {
  const all = readAll();
  delete all[keyFor(email)];
  writeAll(all);
}
