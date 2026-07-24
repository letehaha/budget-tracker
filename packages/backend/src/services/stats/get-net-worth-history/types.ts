import type { Cents, endpointsTypes } from '@bt/shared/types';

/** One end-of-bucket snapshot, all money in base-currency cents. */
export interface NetWorthHistoryPointCents {
  /** yyyy-MM-dd — the bucket-end date the snapshot is taken at. */
  date: string;
  /**
   * Non-liability accounts plus portfolios (holdings + cash), ventures and
   * vehicles, plus credit-card/overdraft accounts currently holding a positive balance.
   */
  assets: Cents;
  /**
   * Balance per liability account category. Credit-card and overdraft carry only
   * their owing accounts (values ≤ 0) — a positive balance on those accounts
   * counts as assets instead; loan carries its whole signed value.
   */
  liabilities: Record<endpointsTypes.NetWorthLiabilityKind, Cents>;
  /** Sum of the `liabilities` values. */
  liabilitiesTotal: Cents;
  /** assets + liabilitiesTotal. */
  netWorth: Cents;
}

export interface NetWorthHistoryResultCents {
  points: NetWorthHistoryPointCents[];
}
