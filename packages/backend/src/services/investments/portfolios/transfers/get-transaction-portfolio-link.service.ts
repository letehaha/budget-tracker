import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import Currencies from '@models/Currencies.model';
import Portfolios from '@models/investments/Portfolios.model';
import PortfolioTransfers from '@models/investments/PortfolioTransfers.model';

interface GetTransactionPortfolioLinkParams {
  userId: number;
  transactionId: number;
}

export const getTransactionPortfolioLink = async ({ userId, transactionId }: GetTransactionPortfolioLinkParams) => {
  const transfer = await findOrThrowNotFound({
    query: PortfolioTransfers.findOne({
      where: { transactionId, userId },
      include: [
        { model: Portfolios, as: 'fromPortfolio' },
        { model: Portfolios, as: 'toPortfolio' },
        { model: Currencies, as: 'currency' },
      ],
    }),
    message: t({ key: 'investments.portfolioTransferNotFound' }),
  });

  // fromAccountId + toPortfolioId = deposit (money flows from account to portfolio)
  // fromPortfolioId + toAccountId = withdrawal (money flows from portfolio to account)
  const isDeposit = transfer.fromAccountId !== null && transfer.toPortfolioId !== null;
  const portfolioId = isDeposit ? transfer.toPortfolioId! : transfer.fromPortfolioId!;
  const portfolio = isDeposit ? transfer.toPortfolio : transfer.fromPortfolio;

  return {
    transferId: transfer.id,
    portfolioId,
    portfolioName: portfolio?.name ?? '',
    transferType: isDeposit ? ('deposit' as const) : ('withdrawal' as const),
    amount: transfer.amount.toJSON(),
    currencyCode: transfer.currencyCode,
    date: transfer.date,
  };
};
