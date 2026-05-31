import { asDecimal, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES, VEHICLE_CLASS } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { format, subYears } from 'date-fns';

function pastDateString({ yearsAgo }: { yearsAgo: number }): string {
  return format(subYears(new Date(), yearsAgo), 'yyyy-MM-dd');
}

function todayString(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

// A sedan bought 3y ago for $25k sits well below $18k on the default curve, so the
// override below always moves the value UP — handy for the positive-control assertion.
async function createVehicleAccount() {
  return helpers.createVehicle({
    name: 'Toyota Camry 2020',
    currencyCode: 'USD',
    make: 'Toyota',
    model: 'Camry',
    year: 2020,
    vehicleClass: VEHICLE_CLASS.sedan,
    purchasePrice: 25000,
    purchaseDate: pastDateString({ yearsAgo: 3 }),
    raw: true,
  });
}

describe('Vehicle account write guards', () => {
  describe('Transaction-creation invariant (model hook)', () => {
    it('rejects a plain expense targeting a vehicle account', async () => {
      const vehicle = await createVehicleAccount();

      const response = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: vehicle.accountId,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: false,
      });

      expect(response.statusCode).toBe(422);
      // Vehicle creation records no transaction, so a clean rollback leaves none.
      const txs = await helpers.getTransactions({ raw: true });
      expect(txs.length).toBe(0);
    });

    it('rejects a plain income targeting a vehicle account', async () => {
      const vehicle = await createVehicleAccount();

      const response = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: vehicle.accountId,
          transactionType: TRANSACTION_TYPES.income,
        }),
        raw: false,
      });

      expect(response.statusCode).toBe(422);
      const txs = await helpers.getTransactions({ raw: true });
      expect(txs.length).toBe(0);
    });

    it('rejects a transfer INTO a vehicle account (and rolls back the source leg)', async () => {
      const vehicle = await createVehicleAccount();
      const source = await helpers.createAccount({ raw: true });

      const response = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({ accountId: source.id }),
          transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
          destinationAmount: 1000,
          destinationAccountId: vehicle.accountId,
        },
        raw: false,
      });

      expect(response.statusCode).toBe(422);
      // The whole transfer must roll back — the source account keeps no orphaned leg.
      const txs = await helpers.getTransactions({ raw: true });
      expect(txs.length).toBe(0);
    });

    it('rejects a transfer OUT of a vehicle account', async () => {
      const vehicle = await createVehicleAccount();
      const destination = await helpers.createAccount({ raw: true });

      const response = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({ accountId: vehicle.accountId }),
          transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
          destinationAmount: 1000,
          destinationAccountId: destination.id,
        },
        raw: false,
      });

      expect(response.statusCode).toBe(422);
      const txs = await helpers.getTransactions({ raw: true });
      expect(txs.length).toBe(0);
    });

    it('rejects an account→portfolio transfer originating from a vehicle account', async () => {
      const vehicle = await createVehicleAccount();
      const portfolio = await helpers.createPortfolio({ raw: true });

      const response = await helpers.accountToPortfolioTransfer({
        portfolioId: portfolio.id,
        payload: {
          accountId: vehicle.accountId,
          amount: '500',
          date: todayString(),
        },
        raw: false,
      });

      expect(response.statusCode).toBe(422);
      const txs = await helpers.getTransactions({ raw: true });
      expect(txs.length).toBe(0);
    });
  });

  describe('Transaction-update invariant (model hook @BeforeUpdate)', () => {
    it('rejects moving an existing transaction onto a vehicle account', async () => {
      const vehicle = await createVehicleAccount();
      const normalAccount = await helpers.createAccount({ raw: true });

      // A legit expense lives on a normal account...
      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: normalAccount.id }),
        raw: true,
      });

      // ...editing it to point at the vehicle account must trip @BeforeUpdate.
      // This is the one bypass the frontend picker-exclusion can't cover, so the
      // model hook is the only thing standing between it and a corrupted anchor.
      const response = await helpers.updateTransaction({
        id: tx.id,
        payload: { accountId: vehicle.accountId },
        raw: false,
      });

      expect(response.statusCode).toBe(422);

      // The update must roll back fully — the tx still belongs to the original
      // account, not the vehicle (no partial move).
      const txs = await helpers.getTransactions({ raw: true });
      expect(txs.length).toBe(1);
      expect(txs[0]!.accountId).toBe(normalAccount.id);
    });
  });

  describe('Generic balance-adjustment reject (service guard)', () => {
    it('rejects POST /accounts/:id/balance-adjustment on a vehicle account', async () => {
      const vehicle = await createVehicleAccount();
      const before = vehicle.account!.currentBalance;

      const response = await helpers.balanceAdjustment({
        id: vehicle.accountId,
        payload: { targetBalance: asDecimal(18000) },
        raw: false,
      });

      expect(response.statusCode).toBe(422);

      // The reject must leave no side effects: no adjustment tx, and the
      // vehicle's value/anchor untouched.
      const txs = await helpers.getTransactions({ raw: true });
      expect(txs.length).toBe(0);
      const after = await helpers.getVehicleById({ id: vehicle.id, raw: true });
      expect(after.account!.currentBalance).toBe(before);
      expect(after.valueAnchor).toBe(vehicle.valueAnchor);
    });
  });

  describe('Generic account-update reject (service guard)', () => {
    it('rejects setting currentBalance directly on a vehicle account', async () => {
      const vehicle = await createVehicleAccount();
      const before = vehicle.account!.currentBalance;

      const response = await helpers.makeRequest({
        method: 'put',
        url: `/accounts/${vehicle.accountId}`,
        payload: { currentBalance: 30000 },
      });

      expect(response.statusCode).toBe(422);

      // Value and anchor must be untouched after the rejected write.
      const after = await helpers.getVehicleById({ id: vehicle.id, raw: true });
      expect(after.account!.currentBalance).toBe(before);
      expect(after.valueAnchor).toBe(vehicle.valueAnchor);
    });
  });

  describe('Sanctioned paths still work (positive controls)', () => {
    it('allows the dedicated override endpoint to change a vehicle value', async () => {
      const vehicle = await createVehicleAccount();
      const before = vehicle.account!.currentBalance;

      const response = await helpers.overrideVehicleValue({
        id: vehicle.id,
        targetValue: 18000,
        raw: false,
      });
      expect(response.statusCode).toBe(200);

      // Same-day override re-anchors to 18000 with no elapsed depreciation, so the
      // value lands at the target and is strictly above the pre-override curve value.
      const after = await helpers.getVehicleById({ id: vehicle.id, raw: true });
      expect(after.account!.currentBalance).toBeGreaterThan(before);
      expect(after.account!.currentBalance).toBeLessThanOrEqual(18000);
      expect(after.account!.currentBalance).toBeGreaterThan(17000);
    });

    it('leaves income, expense and transfers on normal accounts unaffected', async () => {
      const accountA = await helpers.createAccount({ raw: true });
      const accountB = await helpers.createAccount({ raw: true });

      const expense = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: accountA.id }),
        raw: false,
      });
      expect(expense.statusCode).toBe(200);

      const transfer = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({ accountId: accountA.id }),
          transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
          destinationAmount: 1000,
          destinationAccountId: accountB.id,
        },
        raw: false,
      });
      expect(transfer.statusCode).toBe(200);
    });
  });
});
