export const TEST_EMAIL_DOMAIN = 'test.local';

export function isTestEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${TEST_EMAIL_DOMAIN}`);
}
