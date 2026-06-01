import type { VentureDealMetricsModel } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import VentureDeals from '@models/venture/venture-deals.model';
import VentureEvents from '@models/venture/venture-events.model';
import { withTransaction } from '@services/common/with-transaction';
import Big from 'big.js';

import { computeCostBasis } from './compute-cost-basis';
import { computeCumulativeDistributions } from './compute-cumulative-distributions';
import { computeCurrentValue } from './compute-current-value';
import { computeIrr } from './compute-irr';
import { computeDpi, computeTvpi } from './compute-tvpi-dpi';

interface GetDealMetricsParams {
  userId: number;
  dealId: string;
  asOfDate?: Date;
}

const getDealMetricsImpl = async ({
  userId,
  dealId,
  asOfDate = new Date(),
}: GetDealMetricsParams): Promise<VentureDealMetricsModel> => {
  const deal = await findOrThrowNotFound({
    query: VentureDeals.findOne({ where: { id: dealId, userId } }),
    message: 'Venture deal not found',
  });

  const events = await VentureEvents.findAll({ where: { dealId } });

  const costBasis = computeCostBasis({
    dealPrincipal: deal.principal.toDecimalString(10),
    dealEntryFee: deal.entryFee.toDecimalString(10),
    events,
  });

  const cumulativeDistributions = computeCumulativeDistributions({ events });

  const currentValue = computeCurrentValue({
    status: deal.status,
    events,
    costBasis,
    cumulativeDistributions,
  });

  const tvpi = computeTvpi({ currentValue, cumulativeDistributions, costBasis });
  const dpi = computeDpi({ cumulativeDistributions, costBasis });
  const irr = computeIrr({ deal, events, currentValue, asOfDate });

  const pnlAbsolute = new Big(currentValue).plus(cumulativeDistributions).minus(costBasis).toFixed(10);
  const pnlPct = new Big(costBasis).eq(0) ? null : new Big(pnlAbsolute).div(costBasis).toFixed(6);

  return {
    costBasis,
    totalInvested: costBasis,
    currentValue,
    totalDistributions: cumulativeDistributions,
    pnlAbsolute,
    pnlPct,
    tvpi,
    dpi,
    irr,
  };
};

export const getDealMetrics = withTransaction(getDealMetricsImpl);
