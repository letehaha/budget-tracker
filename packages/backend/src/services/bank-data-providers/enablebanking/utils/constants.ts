/**
 * Initial-sync lookback schedule. PSD2 cap unknown per bank, no API to query,
 * so try widest first then shrink on rejection.
 *   1095d ≈ 3y – German banks
 *   730d  = 2y – BNP Paribas Fortis BE
 *   365d  = 1y – Swedbank, Baltic ASPSPs
 *   90d   = PSD2 baseline (unattended access)
 */
export const INITIAL_SYNC_FALLBACK_DAYS = [1095, 730, 365, 90] as const;

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * How far a booked transaction may look back/forward for the pending row it
 * replaces. A Friday card swipe often books on Tuesday, and some ASPSPs drop
 * transaction_date on the booked copy so its date jumps to booking_date.
 * Reconcile pass (a) reuses it, so retuning widens both live sync and reconcile.
 */
export const PENDING_UPGRADE_WINDOW_DAYS = 5;

/**
 * How far the IBAN fingerprint tier may look for a row whose hash date drifted.
 * Reconcile pass (b) reuses it, so retuning widens both live sync and reconcile.
 */
export const FINGERPRINT_WINDOW_DAYS = 2;
