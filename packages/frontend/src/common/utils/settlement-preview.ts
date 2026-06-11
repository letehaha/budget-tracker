export type SettlementMode = 'fee' | 'auto' | 'rate';

export interface SettlementPreview {
  /** Security→settlement conversion rate that would be recorded. */
  rate: number;
  /** Fee in the settlement currency that would be recorded. */
  fee: number;
}

interface SettlementPreviewParams {
  /** sell/dividend — cash comes in; buy/fee/tax — cash goes out. */
  isCashIn: boolean;
  quantity: string;
  price: string;
  /** Absolute cash moved in the settlement currency (the "total" form field). */
  totalCash: string;
  mode: SettlementMode;
  /** Fee in the settlement currency; used by the 'fee' mode. */
  fee?: string;
  /**
   * Security→settlement rate: the user's input in the 'rate' mode, the
   * fetched market rate in the 'auto' mode.
   */
  rate?: string | number;
}

/**
 * Client-side approximation of the backend's cross-currency settlement math
 * (`resolveSettlement`), used only for the live form preview — the backend
 * recomputes everything authoritatively on submit.
 *
 * - 'fee' mode: the conversion rate is derived from the cash moved net of the
 *   fee: rate = (total ∓ fee) / (quantity × price)
 * - 'rate' / 'auto' modes: the fee is the residual between the cash moved and
 *   `quantity × price × rate`; a negative residual is rate inaccuracy, not a
 *   real negative fee — fee becomes 0 and the difference folds into the rate
 *
 * Returns `null` while inputs are incomplete or non-positive.
 */
export function calculateSettlementPreview({
  isCashIn,
  quantity,
  price,
  totalCash,
  mode,
  fee,
  rate,
}: SettlementPreviewParams): SettlementPreview | null {
  const notional = parseFloat(quantity) * parseFloat(price);
  const total = parseFloat(totalCash);

  if (!Number.isFinite(notional) || notional <= 0) return null;
  if (!Number.isFinite(total) || total <= 0) return null;

  if (mode === 'fee') {
    const feeValue = fee ? parseFloat(fee) : 0;
    if (!Number.isFinite(feeValue) || feeValue < 0) return null;

    const gross = isCashIn ? total + feeValue : total - feeValue;
    if (gross <= 0) return null;

    return { rate: gross / notional, fee: feeValue };
  }

  const rateValue = typeof rate === 'number' ? rate : parseFloat(rate ?? '');
  if (!Number.isFinite(rateValue) || rateValue <= 0) return null;

  const gross = notional * rateValue;
  const residualFee = isCashIn ? gross - total : total - gross;

  if (residualFee < 0) {
    return { rate: total / notional, fee: 0 };
  }

  return { rate: rateValue, fee: residualFee };
}
