import type { Cents, endpointsTypes } from '@bt/shared/types';
import type InvestmentTransaction from '@models/investments/investment-transaction.model';

/**
 * Fields the per-bucket flow fold needs. Kept to the minimum the math reads so
 * the unit tests don't have to build whole transaction rows; the service's
 * actual query selects the wider set the shared holdings/cash replays require.
 */
export type InvestmentFlowRow = Pick<InvestmentTransaction, 'category' | 'date' | 'refAmount' | 'refFees'>;

/** Per-bucket investment cash flows, in base-currency cents. */
export interface InvestmentFlowsCents {
  /** Purchase notional (quantity x price), fees excluded. */
  buyNotional: Cents;
  /** Sale notional (quantity x price), fees excluded. */
  sellNotional: Cents;
  /** Dividend notional, before the dividend's own fee. */
  dividendsGross: Cents;
  /** Every fee and tax that reduced the return: trade-embedded plus standalone rows. */
  feesAndTaxes: Cents;
}

/** Per-bucket result, all money in base-currency cents. */
export interface NetWorthDriversBucketCents {
  periodStart: string;
  periodEnd: string;
  savings: {
    income: Cents;
    expenses: Cents;
    net: Cents;
  };
  investments: {
    growth: Cents;
    priceEffect: Cents;
    dividends: Cents;
    feesAndTaxes: Cents;
  };
  composition: {
    holdingsValue: Cents;
    cashValue: Cents;
  };
}

export interface NetWorthDriversResultCents {
  buckets: NetWorthDriversBucketCents[];
  /**
   * Carries no money, so the serializer forwards it to the response as-is; typed
   * off the wire contract rather than restated here to keep the two from drifting.
   */
  degraded?: endpointsTypes.NetWorthDriversDegraded;
}
