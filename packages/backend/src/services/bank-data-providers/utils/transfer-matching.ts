/** Bank transfers between own accounts typically settle within 1-2 business days. */
export const TRANSFER_DATE_WINDOW_DAYS = 3;

export function normalizeIban({ iban }: { iban: string }): string {
  return iban.replace(/\s/g, '').toUpperCase();
}
