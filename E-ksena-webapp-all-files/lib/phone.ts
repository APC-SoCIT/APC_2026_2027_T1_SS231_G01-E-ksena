// E-ksena serves Makati City only, so every contact number is Philippine.
// Numbers are stored in international form (+639171234567) while the user types
// just the 10 digits after +63, which is how people here read them aloud.

export const PH_DIAL_CODE = '+63';

/**
 * Turns a stored number into the digits shown in the input box.
 * Accepts the formats already sitting in the database: +639171234567,
 * 639171234567, 09171234567 and 9171234567 all become 9171234567.
 */
export function toLocalPhoneDigits(stored: string | null | undefined): string {
  if (!stored) return '';
  let digits = stored.replace(/\D/g, '');
  if (digits.startsWith('63')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, 10);
}

/** Builds the value to store from what the user typed. */
export function toStoredPhone(local: string): string {
  return PH_DIAL_CODE + local.replace(/\D/g, '').slice(0, 10);
}

/** Philippine mobile numbers are 10 digits and begin with 9. */
export function isValidPhLocal(local: string): boolean {
  return /^9\d{9}$/.test(local.replace(/\D/g, ''));
}

/** Keeps the input box to digits only, at most 10. */
export function sanitisePhoneInput(text: string): string {
  return text.replace(/\D/g, '').slice(0, 10);
}
