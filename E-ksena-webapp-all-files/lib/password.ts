export const MIN_PASSWORD_LENGTH = 8;

/**
 * Returns the requirements a password does not yet meet, phrased so they can be
 * joined into a sentence. Shared by registration and the change-password form so
 * both enforce one rule.
 */
export function passwordProblems(value: string): string[] {
  const missing: string[] = [];
  if (value.length < MIN_PASSWORD_LENGTH) missing.push(`at least ${MIN_PASSWORD_LENGTH} characters`);
  if (!/[A-Z]/.test(value)) missing.push('an uppercase letter');
  if (!/[a-z]/.test(value)) missing.push('a lowercase letter');
  if (!/\d/.test(value)) missing.push('a number');
  if (!/[^A-Za-z0-9]/.test(value)) missing.push('a special character');
  return missing;
}
