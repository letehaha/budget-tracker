import { ACCOUNT_CATEGORIES, ACCOUNT_TYPES } from '@bt/shared/types';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { Money } from '@common/types/money';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ValidationError } from '@js/errors';

// ── Mocks (hoisted before importing the module under test) ──────────────────

// The service reads/writes the account through the accounts model (default
// export `findOne`, named `updateAccountById`) and cascades opening-balance
// changes through the balances model. Stubbing all three keeps this unit run
// free of the DB/queue connections their real import graph opens.
jest.mock('@models/accounts.model', () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
  updateAccountById: jest.fn(),
}));
jest.mock('@models/balances.model', () => ({
  __esModule: true,
  default: { handleAccountChange: jest.fn() },
}));

// `withTransaction` (imported by the service via ../common/with-transaction)
// reads the ambient CLS transaction from this namespace and, finding none,
// runs the body inside `connection.sequelize.transaction`. The stub runs the
// callback straight through — exactly what a real COMMIT looks like to the
// caller — and reports no ambient transaction so the service's row-lock read
// passes `transaction: undefined`.
jest.mock('@models/connection', () => ({
  __esModule: true,
  connection: {
    sequelize: {
      transaction: (cb: () => Promise<unknown>) => cb(),
    },
  },
  namespace: { get: () => undefined },
}));

/* eslint-disable import/first */
import Accounts, * as AccountsModel from '@models/accounts.model';
import Balances from '@models/balances.model';

import { absorbBalanceAdjustment } from './absorb-balance-adjustment';
/* eslint-enable import/first */

const findOneMock = jest.mocked(Accounts.findOne);
const updateAccountByIdMock = jest.mocked(AccountsModel.updateAccountById);
const handleAccountChangeMock = jest.mocked(Balances.handleAccountChange);

type AccountRow = InstanceType<typeof Accounts>;

const USER_ID = 42;

/**
 * Minimal account shape the service touches: identity, type/category (drive the
 * system + dedicated-flow branches), and the four Money balances it shifts.
 */
function buildAccount({
  id = generateRandomRecordId(),
  name = 'Account',
  type = ACCOUNT_TYPES.monobank,
  accountCategory = ACCOUNT_CATEGORIES.general,
  currentBalance = Money.zero(),
  refCurrentBalance = Money.zero(),
  initialBalance = Money.zero(),
  refInitialBalance = Money.zero(),
}: {
  id?: string;
  name?: string;
  type?: ACCOUNT_TYPES;
  accountCategory?: ACCOUNT_CATEGORIES;
  currentBalance?: Money;
  refCurrentBalance?: Money;
  initialBalance?: Money;
  refInitialBalance?: Money;
} = {}): AccountRow {
  return {
    id,
    name,
    type,
    accountCategory,
    currentBalance,
    refCurrentBalance,
    initialBalance,
    refInitialBalance,
  } as unknown as AccountRow;
}

/** The single `updateAccountById` argument, typed for balance assertions. */
type UpdatePayload = {
  id: string;
  userId: number;
  currentBalance: Money;
  refCurrentBalance: Money;
  initialBalance?: Money;
  refInitialBalance?: Money;
};

const lastUpdatePayload = (): UpdatePayload => updateAccountByIdMock.mock.calls[0]![0] as unknown as UpdatePayload;

beforeEach(() => {
  jest.clearAllMocks();
  findOneMock.mockResolvedValue(null as never);
  // Default: the update succeeds and echoes a distinct sentinel so tests can
  // assert the service returns the written row (not the pre-update read).
  updateAccountByIdMock.mockResolvedValue({ id: 'updated-sentinel' } as never);
  handleAccountChangeMock.mockResolvedValue(undefined as never);
});

describe('absorbBalanceAdjustment', () => {
  it('non-system account: shifts only the current balances, never the opening balance, and skips the balances cascade', async () => {
    const accountId = generateRandomRecordId();
    const account = buildAccount({
      id: accountId,
      type: ACCOUNT_TYPES.monobank,
      accountCategory: ACCOUNT_CATEGORIES.general,
      currentBalance: Money.fromDecimal(100),
      refCurrentBalance: Money.fromDecimal(120),
      initialBalance: Money.fromDecimal(10),
      refInitialBalance: Money.fromDecimal(12),
    });
    findOneMock.mockResolvedValue(account as never);

    await absorbBalanceAdjustment({
      userId: USER_ID,
      accountId,
      amountDelta: Money.fromDecimal(50),
      refAmountDelta: Money.fromDecimal(60),
    });

    expect(updateAccountByIdMock).toHaveBeenCalledTimes(1);
    const payload = lastUpdatePayload();
    expect(payload.id).toBe(accountId);
    expect(payload.userId).toBe(USER_ID);
    // currentBalance = original + amountDelta; refCurrentBalance = original + refAmountDelta.
    expect(payload.currentBalance.toCents()).toBe(Money.fromDecimal(150).toCents());
    expect(payload.refCurrentBalance.toCents()).toBe(Money.fromDecimal(180).toCents());
    // The provider-owned opening balance must NOT move — this is the regression guard.
    expect(payload).not.toHaveProperty('initialBalance');
    expect(payload).not.toHaveProperty('refInitialBalance');

    expect(handleAccountChangeMock).not.toHaveBeenCalled();
  });

  it('system account with non-zero ref delta: also shifts the opening balances and cascades through Balances', async () => {
    const accountId = generateRandomRecordId();
    const account = buildAccount({
      id: accountId,
      type: ACCOUNT_TYPES.system,
      accountCategory: ACCOUNT_CATEGORIES.general,
      currentBalance: Money.fromDecimal(200),
      refCurrentBalance: Money.fromDecimal(200),
      initialBalance: Money.fromDecimal(50),
      refInitialBalance: Money.fromDecimal(50),
    });
    findOneMock.mockResolvedValue(account as never);
    const updatedRow = { id: 'updated-system' } as unknown as AccountRow;
    updateAccountByIdMock.mockResolvedValue(updatedRow as never);

    const result = await absorbBalanceAdjustment({
      userId: USER_ID,
      accountId,
      amountDelta: Money.fromDecimal(30),
      refAmountDelta: Money.fromDecimal(30),
    });

    expect(updateAccountByIdMock).toHaveBeenCalledTimes(1);
    const payload = lastUpdatePayload();
    expect(payload.currentBalance.toCents()).toBe(Money.fromDecimal(230).toCents());
    expect(payload.refCurrentBalance.toCents()).toBe(Money.fromDecimal(230).toCents());
    // System accounts absorb the same deltas into the opening balances.
    expect(payload.initialBalance!.toCents()).toBe(Money.fromDecimal(80).toCents());
    expect(payload.refInitialBalance!.toCents()).toBe(Money.fromDecimal(80).toCents());

    // Cascade runs once with the written row + the pre-update read.
    expect(handleAccountChangeMock).toHaveBeenCalledTimes(1);
    expect(handleAccountChangeMock).toHaveBeenCalledWith({ account: updatedRow, prevAccount: account });

    // The service returns the written row, not the pre-update read.
    expect(result).toBe(updatedRow);
  });

  it('system account with a zero ref delta: still shifts the opening balances but skips the cascade', async () => {
    const accountId = generateRandomRecordId();
    const account = buildAccount({
      id: accountId,
      type: ACCOUNT_TYPES.system,
      accountCategory: ACCOUNT_CATEGORIES.general,
      currentBalance: Money.fromDecimal(75),
      refCurrentBalance: Money.fromDecimal(75),
      initialBalance: Money.fromDecimal(5),
      refInitialBalance: Money.fromDecimal(5),
    });
    findOneMock.mockResolvedValue(account as never);

    await absorbBalanceAdjustment({
      userId: USER_ID,
      accountId,
      amountDelta: Money.fromDecimal(10),
      refAmountDelta: Money.zero(),
    });

    expect(updateAccountByIdMock).toHaveBeenCalledTimes(1);
    const payload = lastUpdatePayload();
    // System branch still writes the opening balances even with a zero ref delta.
    expect(payload.initialBalance!.toCents()).toBe(Money.fromDecimal(15).toCents());
    expect(payload.refInitialBalance!.toCents()).toBe(Money.fromDecimal(5).toCents());

    // The `!refAmountDelta.isZero()` guard blocks the cascade even for a system account.
    expect(handleAccountChangeMock).not.toHaveBeenCalled();
  });

  it('throws ValidationError and never writes when the account is not found', async () => {
    findOneMock.mockResolvedValue(null as never);

    await expect(
      absorbBalanceAdjustment({
        userId: USER_ID,
        accountId: generateRandomRecordId(),
        amountDelta: Money.fromDecimal(10),
        refAmountDelta: Money.fromDecimal(10),
      }),
    ).rejects.toThrow(ValidationError);

    expect(updateAccountByIdMock).not.toHaveBeenCalled();
    expect(handleAccountChangeMock).not.toHaveBeenCalled();
  });

  it.each([ACCOUNT_CATEGORIES.vehicle, ACCOUNT_CATEGORIES.loan])(
    'throws ValidationError for a dedicated-flow account (%s) without writing or cascading',
    async (accountCategory) => {
      const accountId = generateRandomRecordId();
      findOneMock.mockResolvedValue(
        buildAccount({ id: accountId, name: 'Car', type: ACCOUNT_TYPES.monobank, accountCategory }) as never,
      );

      await expect(
        absorbBalanceAdjustment({
          userId: USER_ID,
          accountId,
          amountDelta: Money.fromDecimal(10),
          refAmountDelta: Money.fromDecimal(10),
        }),
      ).rejects.toThrow(ValidationError);

      expect(updateAccountByIdMock).not.toHaveBeenCalled();
      expect(handleAccountChangeMock).not.toHaveBeenCalled();
    },
  );

  it('throws ValidationError when the update returns falsy', async () => {
    const accountId = generateRandomRecordId();
    findOneMock.mockResolvedValue(
      buildAccount({
        id: accountId,
        type: ACCOUNT_TYPES.monobank,
        accountCategory: ACCOUNT_CATEGORIES.general,
      }) as never,
    );
    updateAccountByIdMock.mockResolvedValue(null as never);

    await expect(
      absorbBalanceAdjustment({
        userId: USER_ID,
        accountId,
        amountDelta: Money.fromDecimal(10),
        refAmountDelta: Money.fromDecimal(10),
      }),
    ).rejects.toThrow(ValidationError);

    expect(handleAccountChangeMock).not.toHaveBeenCalled();
  });
});
