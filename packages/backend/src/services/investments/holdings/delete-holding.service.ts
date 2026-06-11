import { INVESTMENT_DECIMAL_SCALE } from '@common/types/money';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { NotAllowedError } from '@js/errors';
import Holdings from '@models/investments/holdings.model';
import InvestmentTransaction from '@models/investments/investment-transaction.model';
import Portfolios from '@models/investments/portfolios.model';
import { withTransaction } from '@services/common/with-transaction';
import { updatePortfolioBalance } from '@services/investments/portfolios/balances';
import { calculateCashDelta } from '@services/investments/transactions/cash-balance-utils';
import { ensureUserCurrencyConnected } from '@services/sharing/auth/ensure-currency-connected.service';
import { Big } from 'big.js';

interface DeleteParams {
  userId: number;
  portfolioId: string;
  securityId: string;
  /**
   * When true, also deletes every InvestmentTransaction for this
   * (portfolioId, securityId) and bypasses the non-zero quantity guard.
   * Cash impact of every deleted transaction is reversed in bulk per
   * currency so portfolio balances stay consistent with the wiped history.
   */
  force?: boolean;
}

const reverseCashImpactForDeletedHolding = async ({
  userId,
  portfolioId,
  transactions,
}: {
  userId: number;
  portfolioId: string;
  transactions: InvestmentTransaction[];
}) => {
  // Aggregate by currency so we issue one balance write per currency, not one
  // per transaction.
  const reversedDeltasByCurrency = new Map<string, Big>();
  for (const tx of transactions) {
    const cashDelta = calculateCashDelta({
      category: tx.category,
      settlementAmount: tx.settlementAmount.toDecimalString(INVESTMENT_DECIMAL_SCALE),
    });
    if (cashDelta === null) continue;
    const reversed = new Big(cashDelta).times(-1);
    const existing = reversedDeltasByCurrency.get(tx.settlementCurrencyCode) ?? new Big(0);
    reversedDeltasByCurrency.set(tx.settlementCurrencyCode, existing.plus(reversed));
  }

  for (const [currencyCode, delta] of reversedDeltasByCurrency) {
    if (delta.eq(0)) continue;
    // The settlement currency may have been disconnected from the user since
    // the transaction was created; idempotently re-link it so the ref-amount
    // lookup inside updatePortfolioBalance doesn't fail.
    await ensureUserCurrencyConnected({ userId, currencyCode });
    const deltaStr = delta.toFixed(10);
    await updatePortfolioBalance({
      userId,
      portfolioId,
      currencyCode,
      availableCashDelta: deltaStr,
      totalCashDelta: deltaStr,
    });
  }
};

const deleteHoldingImpl = async ({ userId, portfolioId, securityId, force = false }: DeleteParams) => {
  await findOrThrowNotFound({
    query: Portfolios.findOne({ where: { id: portfolioId, userId } }),
    message: t({ key: 'investments.portfolioNotFound' }),
  });

  if (force) {
    // Skip the holding lookup so orphan transactions still get cleaned up
    // when the holding row is already gone.
    const transactions = await InvestmentTransaction.findAll({
      where: { portfolioId, securityId },
    });
    if (transactions.length > 0) {
      await reverseCashImpactForDeletedHolding({ userId, portfolioId, transactions });
      await InvestmentTransaction.destroy({ where: { portfolioId, securityId } });
    }
    await Holdings.destroy({ where: { portfolioId, securityId } });
    return;
  }

  const holding = await Holdings.findOne({
    where: { portfolioId, securityId },
  });

  if (!holding) return;

  if (!holding.quantity.isZero()) {
    throw new NotAllowedError({
      message: t({ key: 'investments.cannotDeleteHoldingWithActivePosition' }),
    });
  }

  await holding.destroy();
};

export const deleteHolding = withTransaction(deleteHoldingImpl);
