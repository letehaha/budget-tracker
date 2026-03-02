import { Money } from '@common/types/money';
import { t } from '@i18n/index';
import { NotFoundError, ValidationError } from '@js/errors';
import * as Accounts from '@models/Accounts.model';
import Currencies from '@models/Currencies.model';
import Portfolios from '@models/investments/Portfolios.model';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { Big } from 'big.js';

export function validatePositiveAmount({ amount }: { amount: string }): void {
  if (new Big(amount).lte(0)) {
    throw new ValidationError({ message: t({ key: 'investments.transferAmountMustBePositive' }) });
  }
}

export async function findPortfolioOrThrow({
  portfolioId,
  userId,
  role,
}: {
  portfolioId: number;
  userId: number;
  role: 'source' | 'destination' | 'generic';
}): Promise<Portfolios> {
  const portfolio = await Portfolios.findOne({ where: { id: portfolioId, userId } });

  if (!portfolio) {
    const messageKeyMap = {
      source: 'investments.sourcePortfolioNotFound',
      destination: 'investments.destinationPortfolioNotFound',
      generic: 'investments.portfolioNotFound',
    } as const;

    throw new NotFoundError({ message: t({ key: messageKeyMap[role] }) });
  }

  return portfolio;
}

export async function findAccountOrThrow({
  accountId,
  userId,
  role,
}: {
  accountId: number;
  userId: number;
  role: 'source' | 'destination';
}): Promise<NonNullable<Awaited<ReturnType<typeof Accounts.getAccountById>>>> {
  const account = await Accounts.getAccountById({ userId, id: accountId });

  if (!account) {
    const messageKey =
      role === 'source' ? 'investments.sourceAccountNotFound' : 'investments.destinationAccountNotFound';

    throw new NotFoundError({ message: t({ key: messageKey }) });
  }

  return account;
}

export async function findCurrencyOrThrow({ currencyCode }: { currencyCode: string }): Promise<Currencies> {
  const currency = await Currencies.findByPk(currencyCode);

  if (!currency) {
    throw new NotFoundError({ message: t({ key: 'investments.currencyNotFound' }) });
  }

  return currency;
}

export async function computeRefAmount({
  amount,
  currencyCode,
  userId,
  date,
}: {
  amount: string;
  currencyCode: string;
  userId: number;
  date: string;
}): Promise<Money> {
  return calculateRefAmount({
    amount: Money.fromDecimal(amount),
    baseCode: currencyCode,
    userId,
    date: new Date(date),
  });
}
