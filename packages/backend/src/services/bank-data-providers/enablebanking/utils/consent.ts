/** Consent validity end date, defaulting to the PSD2 baseline of 90 days. */
export function calculateConsentValidUntil({
  bankMaxConsentValidity = 90 * 24 * 60 * 60,
}: {
  bankMaxConsentValidity: number | undefined;
}): Date {
  return new Date(Date.now() + bankMaxConsentValidity * 1000);
}
