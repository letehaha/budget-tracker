import { ACCOUNT_CATEGORIES, ACCOUNT_TYPES } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import Accounts, { createAccount as createAccountInDb } from '@models/accounts.model';
import LoanDetails from '@models/loan-details.model';
import * as UsersCurrencies from '@models/users-currencies.model';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { withTransaction } from '@services/common/with-transaction';
import { format } from 'date-fns';

import type { CreateLoanBody } from './zod-schemas';

interface CreateLoanParams extends CreateLoanBody {
  userId: number;
}

const createLoanImpl = async (params: CreateLoanParams) => {
  const {
    userId,
    name,
    currencyCode,
    initialBalance,
    loanType,
    originalPrincipal,
    interestRate,
    termMonths = null,
    startDate,
    minPayment = null,
    plannedPayment = null,
    paymentDayOfMonth = null,
    lenderName = null,
    accountNumber = null,
  } = params;

  await UsersCurrencies.addCurrency({ userId, currencyCode });

  const now = new Date();

  // Loan balances live on the negative side of the ledger so the user's net
  // worth aggregation picks them up automatically. The API surface accepts a
  // positive outstanding amount; flip it here.
  const negativeBalance = initialBalance.negate();
  const refNegativeBalance = await calculateRefAmount({
    userId,
    amount: negativeBalance,
    baseCode: currencyCode,
    date: now,
  });

  const refOriginalPrincipal = await calculateRefAmount({
    userId,
    amount: originalPrincipal,
    baseCode: currencyCode,
    date: now,
  });

  const refMinPayment =
    minPayment === null
      ? null
      : await calculateRefAmount({ userId, amount: minPayment, baseCode: currencyCode, date: now });

  const refPlannedPayment =
    plannedPayment === null
      ? null
      : await calculateRefAmount({ userId, amount: plannedPayment, baseCode: currencyCode, date: now });

  const zero = Money.zero();

  const account = await createAccountInDb({
    userId,
    name,
    currencyCode,
    accountCategory: ACCOUNT_CATEGORIES.loan,
    type: ACCOUNT_TYPES.system,
    initialBalance: negativeBalance,
    refInitialBalance: refNegativeBalance,
    creditLimit: zero,
    refCreditLimit: zero,
  });

  if (!account) {
    throw new ValidationError({ message: t({ key: 'loans.createAccountFailed' }) });
  }

  const created = await LoanDetails.create({
    accountId: account.id,
    userId,
    loanType,
    originalPrincipal,
    refOriginalPrincipal,
    interestRate,
    termMonths,
    startDate,
    // Anchor defaults to the creation date — the outstanding balance snapshot is
    // true as-of when the loan was entered into the system.
    balanceAnchorDate: format(now, 'yyyy-MM-dd'),
    minPayment,
    refMinPayment,
    plannedPayment,
    refPlannedPayment,
    paymentDayOfMonth,
    lenderName,
    accountNumber,
    events: [],
  });

  // Pull the Account association onto the freshly-created instance so the
  // serializer sees both sides without a second findOne round-trip.
  return created.reload({ include: [{ model: Accounts, as: 'account' }] });
};

export const createLoan = withTransaction(createLoanImpl);
