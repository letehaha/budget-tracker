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
 * A position is "closed" once its quantity reaches zero AND the holding has
 * recorded activity – either a non-zero cost basis (an open partial-fill
 * leftover) or a non-zero realized gain (a completed buy-then-sell cycle).
 *
 * Zero-quantity / zero-cost / zero-realized-gain holdings represent a security
 * that was just added but hasn't received its first transaction yet; those stay
 * out of the closed section so the user can keep building it up.
 */
export const isClosedPosition = (holding: HoldingModel) => {
  if (Number(holding.quantity) !== 0) return false;
  const costBasis = Number(holding.costBasis);
  const realizedGain = Number(holding.realizedGainValue ?? '0');
  return costBasis > 0 || realizedGain !== 0;
};

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
 * Split holdings into three groups – just-added, active, closed – each
 * independently sorted with the same key/direction.
 *
 * The just-added group is for securities the user picked from the Add Symbols
 * dialog during the current session; pinning them at the top lets the user
 * keep adding transactions to a fresh holding without scrolling. Membership
 * is in-memory only and resets on page reload.
 *
 * Closed positions live in their own collapsible section. A just-added id wins
 * over the closed classification – even a zero-everything holding stays in the
 * just-added bucket while the session remembers it.
 */
export const groupHoldings = ({
  holdings,
  sortKey,
  sortDir,
  justAddedIds,
}: {
  holdings: HoldingModel[];
  sortKey: HoldingSortKey;
  sortDir: SortDirection;
  justAddedIds?: ReadonlySet<string>;
}) => {
  const justAdded: HoldingModel[] = [];
  const active: HoldingModel[] = [];
  const closed: HoldingModel[] = [];
  for (const holding of holdings) {
    if (justAddedIds?.has(holding.securityId)) {
      justAdded.push(holding);
    } else if (isClosedPosition(holding)) {
      closed.push(holding);
    } else {
      active.push(holding);
    }
  }
  return {
    justAdded: sortHoldings({ holdings: justAdded, sortKey, sortDir }),
    active: sortHoldings({ holdings: active, sortKey, sortDir }),
    closed: sortHoldings({ holdings: closed, sortKey, sortDir }),
  };
};
