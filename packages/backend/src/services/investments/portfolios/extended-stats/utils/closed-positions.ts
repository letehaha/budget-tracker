/**
 * Closed-position analysis: walk a security's transactions in date order using
 * FIFO cost-basis matching; whenever the running quantity returns to zero we
 * record one "closed position". Re-buying after a zero starts a fresh position.
 *
 * A closed position aggregates total cost basis (sum of consumed buy lots) and
 * total proceeds (sum of net sale proceeds across all sells that contributed),
 * yielding gain in absolute terms and as a percentage of cost basis.
 *
 * Transactions other than buy/sell (dividends, fees, taxes) are ignored — they
 * don't change holdings.
 */
import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments/enums';

const QUANTITY_EPSILON = 1e-12;

export interface ClosedPositionTransaction {
  date: string | Date;
  category: INVESTMENT_TRANSACTION_CATEGORY;
  /** quantity transacted (>0); for sell, the quantity sold */
  quantity: string | number;
  /** per-unit price in the security's currency */
  price: string | number;
  /** total fees on the transaction in the security's currency */
  fees?: string | number;
}

interface ClosedPosition {
  costBasis: number;
  proceeds: number;
  gain: number;
  gainPercent: number;
  /** First buy that opened this position. */
  openedAt: Date;
  /** Sell transaction that brought quantity back to zero. */
  closedAt: Date;
}

interface ClosedPositionsResult {
  positions: ClosedPosition[];
  closedCount: number;
  winningCount: number;
  winRate: number; // 0..100
  avgGain: number;
  avgGainPercent: number;
}

interface BuyLot {
  quantity: number;
  costPerShare: number; // price + (fees / qty)
  date: Date;
}

const toDate = (d: string | Date): Date => (d instanceof Date ? d : new Date(d));

/**
 * Process per-security transactions and emit completed (round-trip) positions.
 *
 * The caller is expected to filter to a single security and pass transactions
 * in any order (we sort here).
 */
export const calculateClosedPositions = ({
  transactions,
}: {
  transactions: ClosedPositionTransaction[];
}): ClosedPosition[] => {
  const sorted = transactions.toSorted((a, b) => toDate(a.date).getTime() - toDate(b.date).getTime());

  const buyQueue: BuyLot[] = [];
  let totalQuantity = 0;
  let positionCostBasis = 0;
  let positionProceeds = 0;
  let positionOpenedAt: Date | null = null;
  const completed: ClosedPosition[] = [];

  for (const tx of sorted) {
    const quantity = Number(tx.quantity);
    const price = Number(tx.price);
    const fees = Number(tx.fees ?? 0);
    const date = toDate(tx.date);

    if (tx.category === INVESTMENT_TRANSACTION_CATEGORY.buy) {
      const feesPerShare = quantity > 0 ? fees / quantity : 0;
      buyQueue.push({ quantity, costPerShare: price + feesPerShare, date });
      totalQuantity += quantity;
      if (positionOpenedAt === null) positionOpenedAt = date;
    } else if (tx.category === INVESTMENT_TRANSACTION_CATEGORY.sell) {
      let remaining = quantity;
      while (remaining > QUANTITY_EPSILON && buyQueue.length > 0) {
        const oldest = buyQueue[0]!;
        const consumed = Math.min(remaining, oldest.quantity);
        const lotCost = consumed * oldest.costPerShare;
        const grossProceeds = consumed * price;
        const feesPortion = quantity > 0 ? (consumed / quantity) * fees : 0;
        const netProceeds = grossProceeds - feesPortion;
        positionCostBasis += lotCost;
        positionProceeds += netProceeds;
        oldest.quantity -= consumed;
        remaining -= consumed;
        totalQuantity -= consumed;
        if (oldest.quantity <= QUANTITY_EPSILON) buyQueue.shift();
      }

      if (totalQuantity <= QUANTITY_EPSILON && positionOpenedAt !== null) {
        const gain = positionProceeds - positionCostBasis;
        const gainPercent = positionCostBasis > 0 ? (gain / positionCostBasis) * 100 : 0;
        completed.push({
          costBasis: positionCostBasis,
          proceeds: positionProceeds,
          gain,
          gainPercent,
          openedAt: positionOpenedAt,
          closedAt: date,
        });
        // reset for any subsequent re-buy
        totalQuantity = 0;
        positionCostBasis = 0;
        positionProceeds = 0;
        positionOpenedAt = null;
        buyQueue.length = 0;
      }
    }
    // dividend/fee/tax/transfer/cancel/other do not affect holdings
  }

  return completed;
};

/**
 * Aggregate closed-position stats across multiple securities.
 *
 * Each input array represents one security's transactions. The function calls
 * `calculateClosedPositions` per security, then summarizes the combined set.
 */
export const summarizeClosedPositions = ({
  transactionsBySecurity,
}: {
  transactionsBySecurity: ClosedPositionTransaction[][];
}): ClosedPositionsResult => {
  const positions: ClosedPosition[] = [];
  for (const securityTxs of transactionsBySecurity) {
    positions.push(...calculateClosedPositions({ transactions: securityTxs }));
  }

  const closedCount = positions.length;
  const winningCount = positions.filter((p) => p.gain > 0).length;
  const winRate = closedCount > 0 ? (winningCount / closedCount) * 100 : 0;

  let totalGain = 0;
  let totalGainPercent = 0;
  for (const p of positions) {
    totalGain += p.gain;
    totalGainPercent += p.gainPercent;
  }
  const avgGain = closedCount > 0 ? totalGain / closedCount : 0;
  const avgGainPercent = closedCount > 0 ? totalGainPercent / closedCount : 0;

  return { positions, closedCount, winningCount, winRate, avgGain, avgGainPercent };
};
