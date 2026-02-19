import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments/enums';

export interface TransactionForGains {
  date: string | Date;
  category: INVESTMENT_TRANSACTION_CATEGORY;
  quantity: string | number;
  price: string | number;
  fees?: string | number;
}

interface UnrealizedGainsResult {
  unrealizedGainValue: number;
  unrealizedGainPercent: number;
}

interface RealizedGainsResult {
  realizedGainValue: number;
  realizedGainPercent: number;
}

/**
 * Calculate unrealized gains/losses for a holding
 * @param marketValue Current market value of the holding
 * @param costBasis Total cost basis (original purchase cost)
 * @returns Unrealized gains in dollars and percentage
 */
export function calculateUnrealizedGains(marketValue: number, costBasis: number): UnrealizedGainsResult {
  const unrealizedGainValue = marketValue - costBasis;
  const unrealizedGainPercent = costBasis > 0 ? (unrealizedGainValue / costBasis) * 100 : 0;

  return {
    unrealizedGainValue,
    unrealizedGainPercent,
  };
}

/**
 * Calculate realized gains/losses using FIFO (First In, First Out) method
 * @param transactions Array of buy/sell transactions sorted by date
 * @returns Realized gains in dollars and total cost basis for percentage calculation
 */
export function calculateRealizedGains(transactions: TransactionForGains[]): RealizedGainsResult {
  // Sort transactions by date to ensure FIFO
  const sortedTransactions = [...transactions].sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    return dateA - dateB;
  });

  let totalRealizedGain = 0;
  let totalCostBasisOfSoldShares = 0;

  // FIFO queue: array of {quantity, price, fees} for purchased shares
  const buyQueue: Array<{ quantity: number; price: number; fees: number }> = [];

  for (const transaction of sortedTransactions) {
    const quantity = Number(transaction.quantity);
    const price = Number(transaction.price);
    const fees = Number(transaction.fees || 0);

    if (transaction.category === INVESTMENT_TRANSACTION_CATEGORY.buy) {
      // Add to FIFO queue with fees distributed per share
      const feesPerShare = quantity > 0 ? fees / quantity : 0;
      buyQueue.push({
        quantity,
        price: price + feesPerShare, // Include fees in cost basis
        fees: 0, // Already distributed to price
      });
    } else if (transaction.category === INVESTMENT_TRANSACTION_CATEGORY.sell) {
      let remainingToSell = quantity;

      while (remainingToSell > 0 && buyQueue.length > 0) {
        const oldest = buyQueue[0];
        if (!oldest) break; // Safety check

        const sellQuantity = Math.min(remainingToSell, oldest.quantity);

        // Calculate gain/loss for this portion of the sale
        const costBasisForSoldShares = sellQuantity * oldest.price;
        const grossProceeds = sellQuantity * price;
        const feesForThisPortion = (sellQuantity / quantity) * fees; // Proportional fees
        const netProceeds = grossProceeds - feesForThisPortion;

        const gainLoss = netProceeds - costBasisForSoldShares;
        totalRealizedGain += gainLoss;
        totalCostBasisOfSoldShares += costBasisForSoldShares;

        // Update the buy queue
        oldest.quantity -= sellQuantity;
        remainingToSell -= sellQuantity;

        // Remove completely sold lots from queue
        if (oldest.quantity <= 0) {
          buyQueue.shift();
        }
      }

      // Handle phantom shares (selling more than owned) by treating them as zero cost basis
      if (remainingToSell > 0) {
        const phantomSharesGrossProceeds = remainingToSell * price;
        const phantomSharesFees = (remainingToSell / quantity) * fees; // Proportional fees
        const phantomSharesNetProceeds = phantomSharesGrossProceeds - phantomSharesFees;

        // Phantom shares have zero cost basis, so entire net proceeds is gain
        totalRealizedGain += phantomSharesNetProceeds;
        // No cost basis to add for phantom shares (they cost nothing)
      }
    }
  }

  // Calculate percentage more intelligently:
  // - If we have real shares (cost basis > 0): use traditional calculation
  // - If pure phantom shares (no cost basis): treat as 100% gain since it's pure profit
  let realizedGainPercent = 0;

  if (totalCostBasisOfSoldShares > 0) {
    // Traditional calculation when there's actual investment
    realizedGainPercent = (totalRealizedGain / totalCostBasisOfSoldShares) * 100;
  } else if (totalRealizedGain > 0) {
    // Pure phantom shares scenario - treat as 100% gain (pure profit with no investment)
    realizedGainPercent = 100;
  }

  return {
    realizedGainValue: totalRealizedGain,
    realizedGainPercent,
  };
}

/**
 * Calculate combined gains/losses for a holding
 * @param marketValue Current market value
 * @param costBasis Total cost basis
 * @param transactions All transactions for this holding
 * @returns Combined unrealized and realized gains
 */
export function calculateAllGains(marketValue: number, costBasis: number, transactions: TransactionForGains[]) {
  const unrealizedGains = calculateUnrealizedGains(marketValue, costBasis);
  const realizedGains = calculateRealizedGains(transactions);

  return {
    ...unrealizedGains,
    ...realizedGains,
  };
}
