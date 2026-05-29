import type { HoldingModel } from '@bt/shared/types/investments';

export type HoldingSortKey =
  | 'symbol'
  | 'quantity'
  | 'value'
  | 'avgCost'
  | 'totalCost'
  | 'unrealizedGain'
  | 'realizedGain';

type SortDirection = 'asc' | 'desc';

export const getPrice = (holding: HoldingModel) => {
  if (holding.latestPrice) {
    return Number(holding.latestPrice);
  }
  const quantity = Number(holding.quantity);
  const marketValue = Number(holding.marketValue || 0);
  return quantity > 0 && marketValue > 0 ? marketValue / quantity : 0;
};

export const getAverageCost = (holding: HoldingModel) => {
  const quantity = Number(holding.quantity);
  const costBasis = Number(holding.costBasis);
  return quantity > 0 && costBasis > 0 ? costBasis / quantity : 0;
};

export const getTotalCost = (holding: HoldingModel) => Number(holding.costBasis);

/**
 * A position is considered "closed" once its quantity reaches zero — the user
 * has fully divested but the holding row is kept around for its realized gains.
 */
export const isClosedPosition = (holding: HoldingModel) => Number(holding.quantity) === 0;

const compareHoldings = ({
  a,
  b,
  sortKey,
  sortDir,
}: {
  a: HoldingModel;
  b: HoldingModel;
  sortKey: HoldingSortKey;
  sortDir: SortDirection;
}) => {
  let av: string | number;
  let bv: string | number;

  switch (sortKey) {
    case 'symbol':
      av = a.security?.symbol ?? '';
      bv = b.security?.symbol ?? '';
      break;
    case 'quantity':
      av = Number(a.quantity);
      bv = Number(b.quantity);
      break;
    case 'value':
      av = Number(a.marketValue || 0);
      bv = Number(b.marketValue || 0);
      break;
    case 'avgCost':
      av = getAverageCost(a);
      bv = getAverageCost(b);
      break;
    case 'totalCost':
      av = getTotalCost(a);
      bv = getTotalCost(b);
      break;
    case 'unrealizedGain':
      av = Number(a.unrealizedGainValue || 0);
      bv = Number(b.unrealizedGainValue || 0);
      break;
    case 'realizedGain':
      av = Number(a.realizedGainValue || 0);
      bv = Number(b.realizedGainValue || 0);
      break;
  }

  if (typeof av === 'string') av = av.toLocaleLowerCase();
  if (typeof bv === 'string') bv = bv.toLocaleLowerCase();
  return sortDir === 'asc' ? (av > bv ? 1 : -1) : av < bv ? 1 : -1;
};

export const sortHoldings = ({
  holdings,
  sortKey,
  sortDir,
}: {
  holdings: HoldingModel[];
  sortKey: HoldingSortKey;
  sortDir: SortDirection;
}) => [...holdings].sort((a, b) => compareHoldings({ a, b, sortKey, sortDir }));

/**
 * Split holdings into active vs. closed groups, each independently sorted with
 * the same key/direction. Used to keep closed (zero-quantity) positions tucked
 * under their own collapsible section instead of intermixed with active ones.
 */
export const groupHoldings = ({
  holdings,
  sortKey,
  sortDir,
}: {
  holdings: HoldingModel[];
  sortKey: HoldingSortKey;
  sortDir: SortDirection;
}) => {
  const active: HoldingModel[] = [];
  const closed: HoldingModel[] = [];
  for (const holding of holdings) {
    (isClosedPosition(holding) ? closed : active).push(holding);
  }
  return {
    active: sortHoldings({ holdings: active, sortKey, sortDir }),
    closed: sortHoldings({ holdings: closed, sortKey, sortDir }),
  };
};
