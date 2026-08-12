import {
  ACCOUNT_TYPES,
  type RecordId,
  RESOURCE_TYPES,
  SHARE_PERMISSIONS,
  TRANSACTIONS_WRITE_SCOPES,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
  VEHICLE_CLASS,
} from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import ResourceShares from '@models/resource-shares.model';
import * as helpers from '@tests/helpers';
import { addDays, format, subYears } from 'date-fns';

const FUTURE_TIME = () => addDays(new Date(), 5).toISOString();

const createOwnedAccount = ({ initialBalance = 0 }: { initialBalance?: number } = {}) =>
  helpers.createAccount({ payload: helpers.buildAccountPayload({ initialBalance }), raw: true });

const getBalance = async ({ accountId }: { accountId: string }) =>
  (await helpers.getAccount({ id: accountId, raw: true })).currentBalance;

const seedHouseholdMember = async ({ ownerUserId }: { ownerUserId: number }) => {
  const member = await helpers.provisionSecondUserWithBaseCurrency();
  const memberApp = await helpers.findAppUserByEmail({ email: member.email });

  await ResourceShares.create({
    ownerUserId,
    sharedWithUserId: memberApp.id,
    resourceType: RESOURCE_TYPES.household,
    resourceId: String(ownerUserId),
    permission: SHARE_PERMISSIONS.write,
    policy: { transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.all },
    acceptedAt: new Date(),
  });

  return member;
};

const createMonobankAccount = async () => {
  await helpers.monobank.pair();
  const { account } = await helpers.monobank.mockTransactions();
  return account;
};

describe('Planned transactions', () => {
  describe('POST /transactions with isPlanned', () => {
    it('creates a planned transaction without moving any balance', async () => {
      const account = await createOwnedAccount({ initialBalance: 1000 });
      const historyBefore = await helpers.getBalanceHistory({ accountId: account.id, raw: true });

      const [tx] = await helpers.createPlannedTransaction({
        payload: { accountId: account.id, amount: 250, time: FUTURE_TIME() },
        raw: true,
      });

      expect(tx.isPlanned).toBe(true);
      expect(await getBalance({ accountId: account.id })).toBe(1000);
      expect(await helpers.getBalanceHistory({ accountId: account.id, raw: true })).toEqual(historyBefore);
    });

    it('rejects a planned transfer', async () => {
      const [source, destination] = await Promise.all([createOwnedAccount(), createOwnedAccount()]);

      const response = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: source.id,
          amount: 100,
          transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
          destinationAccountId: destination.id,
          destinationAmount: 100,
          isPlanned: true,
        }),
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('rejects a planned refund', async () => {
      const account = await createOwnedAccount({ initialBalance: 1000 });
      const [original] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const response = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.income,
          refundForTxId: original.id,
          isPlanned: true,
        }),
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('rejects a zero amount', async () => {
      const account = await createOwnedAccount();

      const response = await helpers.createPlannedTransaction({
        payload: { accountId: account.id, amount: 0 },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('rejects a negative amount', async () => {
      const account = await createOwnedAccount();

      const response = await helpers.createPlannedTransaction({
        payload: { accountId: account.id, amount: -100 },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('rejects a loan account', async () => {
      const loan = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({ currencyCode: global.BASE_CURRENCY.code }),
        raw: true,
      });

      const response = await helpers.createPlannedTransaction({
        payload: { accountId: loan.id as RecordId, amount: 100 },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('rejects a vehicle account', async () => {
      const vehicle = await helpers.createVehicle({
        name: 'Toyota Camry 2020',
        currencyCode: global.BASE_CURRENCY.code,
        make: 'Toyota',
        model: 'Camry',
        year: 2020,
        vehicleClass: VEHICLE_CLASS.sedan,
        purchasePrice: 25000,
        purchaseDate: format(subYears(new Date(), 3), 'yyyy-MM-dd'),
        raw: true,
      });

      const response = await helpers.createPlannedTransaction({
        payload: { accountId: vehicle.accountId, amount: 100 },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('rejects a full-scope member planning on an account shared with them', async () => {
      const account = await createOwnedAccount({ initialBalance: 1000 });
      const member = await seedHouseholdMember({ ownerUserId: account.userId });

      const response = await helpers.asUser({
        cookies: member.cookies,
        fn: () => helpers.createPlannedTransaction({ payload: { accountId: account.id, amount: 100 } }),
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
      expect(await getBalance({ accountId: account.id })).toBe(1000);
    });
  });

  describe('PUT /transactions/:id on a provider-linked account', () => {
    it('lets the owner edit amount, time and note of a planned row', async () => {
      const account = await createMonobankAccount();

      const [planned] = await helpers.createPlannedTransaction({
        payload: { accountId: account.id, amount: 250, time: FUTURE_TIME() },
        raw: true,
      });

      const newTime = addDays(new Date(), 9).toISOString();
      const response = await helpers.updateTransaction({
        id: planned.id,
        payload: { amount: 310, time: newTime, note: 'rent' },
      });

      expect(response.statusCode).toBe(200);

      const updated = await helpers.getTransactionById({ id: planned.id, raw: true });
      expect(updated!.amount).toBe(310);
      expect(updated!.note).toBe('rent');
      expect(updated!.isPlanned).toBe(true);
    });

    it('deletes a planned row and leaves the account balance alone', async () => {
      const account = await createMonobankAccount();
      const balanceBefore = await getBalance({ accountId: account.id });

      const [planned] = await helpers.createPlannedTransaction({
        payload: { accountId: account.id, amount: 250, time: FUTURE_TIME() },
        raw: true,
      });

      const response = await helpers.deleteTransaction({ id: planned.id });

      expect(response.statusCode).toBe(200);
      expect(await helpers.getTransactionById({ id: planned.id, raw: true })).toBe(null);
      expect(await getBalance({ accountId: account.id })).toBe(balanceBefore);
    });

    it('stamps the provider account type on a plan the user types in', async () => {
      const account = await createMonobankAccount();

      const [planned] = await helpers.createPlannedTransaction({
        payload: { accountId: account.id, amount: 250, time: FUTURE_TIME() },
        raw: true,
      });

      const stored = await helpers.getTransactionById({ id: planned.id, raw: true });
      expect(stored!.accountType).toBe(ACCOUNT_TYPES.monobank);
    });

    it('rejects a non-planned transaction and leaves the balance alone', async () => {
      const account = await createMonobankAccount();
      const balanceBefore = Number(await getBalance({ accountId: account.id }));

      const response = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 250,
          transactionType: TRANSACTION_TYPES.expense,
        }),
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
      expect(Number(await getBalance({ accountId: account.id }))).toBe(balanceBefore);
    });

    it('rejects unchecking planned, because only the sync confirms money on a bank account', async () => {
      const account = await createMonobankAccount();
      const balanceBefore = Number(await getBalance({ accountId: account.id }));

      const [planned] = await helpers.createPlannedTransaction({
        payload: {
          accountId: account.id,
          amount: 250,
          transactionType: TRANSACTION_TYPES.expense,
          time: FUTURE_TIME(),
        },
        raw: true,
      });

      const response = await helpers.updateTransaction({ id: planned.id, payload: { isPlanned: false } });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);

      const updated = await helpers.getTransactionById({ id: planned.id, raw: true });
      expect(updated!.isPlanned).toBe(true);
      expect(Number(await getBalance({ accountId: account.id }))).toBe(balanceBefore);
    });

    it('rejects moving an ordinary transaction onto the bank account', async () => {
      const [manualAccount, bankAccount] = await Promise.all([
        createOwnedAccount({ initialBalance: 1000 }),
        createMonobankAccount(),
      ]);

      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: manualAccount.id,
          amount: 250,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const response = await helpers.updateTransaction({ id: tx.id, payload: { accountId: bankAccount.id } });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);

      const untouched = await helpers.getTransactionById({ id: tx.id, raw: true });
      expect(untouched!.accountId).toBe(manualAccount.id);
    });

    it('accepts unchecking planned when the same request moves the row to a manual account', async () => {
      const [manualAccount, bankAccount] = await Promise.all([
        createOwnedAccount({ initialBalance: 1000 }),
        createMonobankAccount(),
      ]);

      const [planned] = await helpers.createPlannedTransaction({
        payload: {
          accountId: bankAccount.id,
          amount: 250,
          transactionType: TRANSACTION_TYPES.expense,
          time: FUTURE_TIME(),
        },
        raw: true,
      });

      const response = await helpers.updateTransaction({
        id: planned.id,
        payload: { isPlanned: false, accountId: manualAccount.id, time: new Date().toISOString() },
      });

      expect(response.statusCode).toBe(200);

      const updated = await helpers.getTransactionById({ id: planned.id, raw: true });
      expect(updated!.isPlanned).toBe(false);
      expect(updated!.accountId).toBe(manualAccount.id);
      expect(updated!.accountType).toBe(ACCOUNT_TYPES.system);
      // The row is real money now, so it lands on the manual account it moved to.
      expect(Number(await getBalance({ accountId: manualAccount.id }))).toBeCloseTo(750, 2);
    });

    it('still rejects unchecking planned when the row moves to another bank account', async () => {
      const bankAccount = await createMonobankAccount();

      const [planned] = await helpers.createPlannedTransaction({
        payload: {
          accountId: bankAccount.id,
          amount: 250,
          transactionType: TRANSACTION_TYPES.expense,
          time: FUTURE_TIME(),
        },
        raw: true,
      });

      const response = await helpers.updateTransaction({
        id: planned.id,
        payload: { isPlanned: false, accountId: bankAccount.id },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
      expect((await helpers.getTransactionById({ id: planned.id, raw: true }))!.isPlanned).toBe(true);
    });
  });

  describe('PUT /transactions/:id on a row that stays planned', () => {
    it('rejects moving a plan onto a loan account', async () => {
      const account = await createOwnedAccount({ initialBalance: 1000 });
      const loan = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({ currencyCode: global.BASE_CURRENCY.code }),
        raw: true,
      });
      const loanBalanceBefore = (await helpers.getLoanById({ id: loan.id, raw: true })).currentBalance;

      const [planned] = await helpers.createPlannedTransaction({
        payload: { accountId: account.id, amount: 250, time: FUTURE_TIME() },
        raw: true,
      });

      const response = await helpers.updateTransaction({
        id: planned.id,
        payload: { accountId: loan.id as RecordId },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);

      const untouched = await helpers.getTransactionById({ id: planned.id, raw: true });
      expect(untouched!.accountId).toBe(account.id);
      expect(untouched!.isPlanned).toBe(true);
      expect(await getBalance({ accountId: account.id })).toBe(1000);
      expect((await helpers.getLoanById({ id: loan.id, raw: true })).currentBalance).toBe(loanBalanceBefore);
    });

    it('rejects turning a plan into a transfer and leaves both balances alone', async () => {
      const [source, destination] = await Promise.all([
        createOwnedAccount({ initialBalance: 1000 }),
        createOwnedAccount({ initialBalance: 1000 }),
      ]);

      const [planned] = await helpers.createPlannedTransaction({
        payload: {
          accountId: source.id,
          amount: 250,
          transactionType: TRANSACTION_TYPES.expense,
          time: FUTURE_TIME(),
        },
        raw: true,
      });

      const response = await helpers.updateTransaction({
        id: planned.id,
        payload: {
          transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
          destinationAccountId: destination.id,
          destinationAmount: 250,
        },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);

      const untouched = await helpers.getTransactionById({ id: planned.id, raw: true });
      expect(untouched!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.not_transfer);
      expect(untouched!.isPlanned).toBe(true);
      expect(await getBalance({ accountId: source.id })).toBe(1000);
      expect(await getBalance({ accountId: destination.id })).toBe(1000);
    });

    it('rejects linking a plan as a loan payment', async () => {
      const account = await createOwnedAccount({ initialBalance: 1000 });
      const loan = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({
          currencyCode: global.BASE_CURRENCY.code,
          initialBalance: 1000,
          originalPrincipal: 1000,
        }),
        raw: true,
      });

      const [planned] = await helpers.createPlannedTransaction({
        payload: {
          accountId: account.id,
          amount: 250,
          transactionType: TRANSACTION_TYPES.expense,
          time: FUTURE_TIME(),
        },
        raw: true,
      });

      const response = await helpers.linkLoanPayments({ id: loan.id, transactionIds: [planned.id] });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
      expect((await helpers.getLoanById({ id: loan.id, raw: true })).currentBalance).toBe(-1000);

      const untouched = await helpers.getTransactionById({ id: planned.id, raw: true });
      expect(untouched!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.not_transfer);
      expect(untouched!.isPlanned).toBe(true);
      expect(await getBalance({ accountId: account.id })).toBe(1000);
    });
  });

  describe('flipping an existing row to planned', () => {
    it('rejects both legs of a transfer and leaves the balances alone', async () => {
      const [source, destination] = await Promise.all([
        createOwnedAccount({ initialBalance: 1000 }),
        createOwnedAccount({ initialBalance: 1000 }),
      ]);

      const [baseTx, oppositeTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: source.id,
          amount: 100,
          transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
          destinationAccountId: destination.id,
          destinationAmount: 100,
        }),
        raw: true,
      });

      for (const leg of [baseTx, oppositeTx!]) {
        const response = await helpers.updateTransaction({ id: leg.id, payload: { isPlanned: true } });
        expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
      }

      expect(await getBalance({ accountId: source.id })).toBe(900);
      expect(await getBalance({ accountId: destination.id })).toBe(1100);
    });

    it('rejects a refund-linked row and leaves the balance alone', async () => {
      const account = await createOwnedAccount({ initialBalance: 1000 });

      const [original] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });
      const [refund] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.income,
        }),
        raw: true,
      });
      await helpers.createSingleRefund({ originalTxId: original.id, refundTxId: refund.id });

      const response = await helpers.updateTransaction({ id: refund.id, payload: { isPlanned: true } });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
      expect(await getBalance({ accountId: account.id })).toBe(1000);
    });

    it('rejects a flip attempted by a full-scope member', async () => {
      const account = await createOwnedAccount({ initialBalance: 1000 });
      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 100 }),
        raw: true,
      });
      const member = await seedHouseholdMember({ ownerUserId: account.userId });

      const response = await helpers.asUser({
        cookies: member.cookies,
        fn: () => helpers.updateTransaction({ id: tx.id, payload: { isPlanned: true } }),
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
      expect(await getBalance({ accountId: account.id })).toBe(900);
    });

    it('rejects a flip that adds transfer fields in the same request', async () => {
      const [source, destination] = await Promise.all([
        createOwnedAccount({ initialBalance: 1000 }),
        createOwnedAccount({ initialBalance: 1000 }),
      ]);
      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: source.id,
          amount: 250,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const response = await helpers.updateTransaction({
        id: tx.id,
        payload: {
          isPlanned: true,
          transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
          destinationAccountId: destination.id,
          destinationAmount: 250,
        },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);

      const untouched = await helpers.getTransactionById({ id: tx.id, raw: true });
      expect(untouched!.isPlanned).toBe(false);
      expect(untouched!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.not_transfer);
      expect(await getBalance({ accountId: source.id })).toBe(750);
      expect(await getBalance({ accountId: destination.id })).toBe(1000);
    });

    it('rejects a flip that moves the row onto a loan account in the same request', async () => {
      const account = await createOwnedAccount({ initialBalance: 1000 });
      const loan = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({ currencyCode: global.BASE_CURRENCY.code }),
        raw: true,
      });
      const loanBalanceBefore = (await helpers.getLoanById({ id: loan.id, raw: true })).currentBalance;
      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 250,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const response = await helpers.updateTransaction({
        id: tx.id,
        payload: { isPlanned: true, accountId: loan.id as RecordId },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);

      const untouched = await helpers.getTransactionById({ id: tx.id, raw: true });
      expect(untouched!.isPlanned).toBe(false);
      expect(untouched!.accountId).toBe(account.id);
      expect(await getBalance({ accountId: account.id })).toBe(750);
      expect((await helpers.getLoanById({ id: loan.id, raw: true })).currentBalance).toBe(loanBalanceBefore);
    });

    it('applies and reverts the amount as the flag toggles on a manual account', async () => {
      const account = await createOwnedAccount({ initialBalance: 1000 });

      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 250,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });
      expect(await getBalance({ accountId: account.id })).toBe(750);

      await helpers.updateTransaction({ id: tx.id, payload: { isPlanned: true }, raw: true });
      expect(await getBalance({ accountId: account.id })).toBe(1000);

      await helpers.updateTransaction({ id: tx.id, payload: { isPlanned: false }, raw: true });
      expect(await getBalance({ accountId: account.id })).toBe(750);
    });
  });

  describe('owner-only writes on planned rows', () => {
    it('rejects a full-scope member updating and deleting the owner planned row', async () => {
      const account = await createOwnedAccount({ initialBalance: 1000 });
      const [planned] = await helpers.createPlannedTransaction({
        payload: { accountId: account.id, amount: 250, time: FUTURE_TIME() },
        raw: true,
      });
      const member = await seedHouseholdMember({ ownerUserId: account.userId });

      const updateResponse = await helpers.asUser({
        cookies: member.cookies,
        fn: () => helpers.updateTransaction({ id: planned.id, payload: { note: 'not yours' } }),
      });
      expect(updateResponse.statusCode).toBe(ERROR_CODES.Forbidden);

      const deleteResponse = await helpers.asUser({
        cookies: member.cookies,
        fn: () => helpers.deleteTransaction({ id: planned.id }),
      });
      expect(deleteResponse.statusCode).toBe(ERROR_CODES.Forbidden);

      expect(await helpers.getTransactionById({ id: planned.id, raw: true })).not.toBe(null);
    });
  });

  describe('GET /transactions', () => {
    it('returns the owner planned rows alongside real ones', async () => {
      const account = await createOwnedAccount({ initialBalance: 1000 });

      const [real] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 100 }),
        raw: true,
      });
      const [planned] = await helpers.createPlannedTransaction({
        payload: { accountId: account.id, amount: 250, time: FUTURE_TIME() },
        raw: true,
      });

      const transactions = await helpers.getTransactions({ raw: true });
      const byId = new Map(transactions.map((item) => [item.id, item]));

      expect(byId.get(real.id)!.isPlanned).toBe(false);
      expect(byId.get(planned.id)!.isPlanned).toBe(true);
    });

    it('leaves the balance untouched when a planned row is deleted', async () => {
      const account = await createOwnedAccount({ initialBalance: 1000 });
      const [planned] = await helpers.createPlannedTransaction({
        payload: { accountId: account.id, amount: 250, time: FUTURE_TIME() },
        raw: true,
      });

      const response = await helpers.deleteTransaction({ id: planned.id });

      expect(response.statusCode).toBe(200);
      expect(await getBalance({ accountId: account.id })).toBe(1000);
    });
  });
});
