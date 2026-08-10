import {
  API_ERROR_CODES,
  BANK_PROVIDER_TYPE,
  TRANSACTION_TRANSFER_NATURE,
  VEHICLE_CLASS,
  asDecimal,
} from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import Accounts from '@models/accounts.model';
import Balances from '@models/balances.model';
import Transactions from '@models/transactions.model';
import * as helpers from '@tests/helpers';
import { getMockedLunchFlowTransactions } from '@tests/mocks/lunchflow/data';
import {
  VALID_LUNCHFLOW_API_KEY,
  getLunchFlowBalanceMock,
  getLunchFlowTransactionsMock,
} from '@tests/mocks/lunchflow/mock-api';
import { format, subDays, subYears } from 'date-fns';

/**
 * Linking an existing system account to a bank connection must reconcile the
 * balance WITHOUT minting `transfer_out_wallet` "Balance adjustment" rows:
 * the post-link sync backfills the gap transactions and force-writes the
 * bank's authoritative balance, so an adjustment created up-front both spams
 * the transaction feed and double-counts the gap in the ledger.
 *
 * The invariant checked throughout: initialBalance + Σsigned(tx) === currentBalance.
 */

const LUNCHFLOW_EXTERNAL_ACCOUNT_ID = '1001';

/** Reads the error envelope (`code` + `message`) from a failed helper response. */
const extractError = (response: unknown) =>
  (response as helpers.CustomResponse<unknown>).body.response as unknown as { code: string; message: string };

/** Bank-reported balance, in dollars (LunchFlow account 1001 is USD). */
const mockBankBalance = ({ amount }: { amount: number }) =>
  getLunchFlowBalanceMock({
    accountId: LUNCHFLOW_EXTERNAL_ACCOUNT_ID,
    response: { balance: { amount: asDecimal(amount), currency: 'USD' } },
  });

const sumSignedCents = (transactions: Transactions[]) =>
  transactions.reduce((acc, tx) => acc + (tx.transactionType === 'income' ? Number(tx.amount) : -Number(tx.amount)), 0);

const setupLinkedScenario = async ({
  initialBalance,
  bankBalance,
  bankTransactions,
}: {
  initialBalance: number;
  bankBalance: number;
  bankTransactions: ReturnType<typeof getMockedLunchFlowTransactions>;
}) => {
  await helpers.addUserCurrencies({ currencyCodes: ['USD'], raw: true });

  const account = await helpers.createAccount({
    payload: helpers.buildAccountPayload({
      name: 'Linkable system account',
      currencyCode: 'USD',
      initialBalance,
    }),
    raw: true,
  });

  const { connectionId } = await helpers.bankDataProviders.connectProvider({
    providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
    credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
    raw: true,
  });

  global.mswMockServer.use(
    getLunchFlowTransactionsMock({ response: bankTransactions, accountId: LUNCHFLOW_EXTERNAL_ACCOUNT_ID }),
    mockBankBalance({ amount: bankBalance }),
  );

  const preLinkAccount = (await Accounts.findByPk(account.id))!;

  const linkResponse = await helpers.linkAccountToBankConnection({
    id: account.id,
    connectionId,
    externalAccountId: LUNCHFLOW_EXTERNAL_ACCOUNT_ID,
    raw: false,
  });
  expect(linkResponse.statusCode).toBe(200);

  return { account, preLinkAccount, connectionId };
};

const readTodayBalanceRow = async ({ accountId }: { accountId: string }) =>
  Balances.findOne({ where: { accountId, date: format(new Date(), 'yyyy-MM-dd') } });

describe('Balance reconciliation when linking account to a bank connection', () => {
  it('does not create an adjustment transaction when the gap is fully explained by synced transactions', async () => {
    // Bank: 1000 (matches system balance) + 100 income from the gap = 1100.
    const bankTransactions = getMockedLunchFlowTransactions(1);
    bankTransactions.transactions[0]!.amount = asDecimal(100);
    bankTransactions.transactions[0]!.date = subDays(new Date(), 1).toISOString();

    const { account } = await setupLinkedScenario({
      initialBalance: 1000,
      bankBalance: 1100,
      bankTransactions,
    });

    const updatedAccount = (await Accounts.findByPk(account.id))!;
    const transactions = await Transactions.findAll({ where: { accountId: account.id }, raw: true });

    // The gap income must be synced exactly once.
    const syncedIncomes = transactions.filter((tx) => tx.originalId !== null);
    expect(syncedIncomes.length).toBe(1);

    // The sync backfills the +100 and force-writes the bank balance, so an
    // up-front adjustment both spams the feed and double-counts the gap.
    const adjustments = transactions.filter(
      (tx) => tx.transferNature === TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
    );
    expect(adjustments.length).toBe(0);

    expect(updatedAccount.currentBalance.toNumber()).toBe(1100);
    // Ledger identity: the books must explain the balance.
    expect(updatedAccount.initialBalance.toCents() + sumSignedCents(transactions)).toBe(
      updatedAccount.currentBalance.toCents(),
    );
  });

  it('absorbs a residual difference into initialBalance when the bank returns no transactions', async () => {
    const { account, preLinkAccount } = await setupLinkedScenario({
      initialBalance: 1000,
      bankBalance: 1100,
      bankTransactions: { transactions: [], total: 0 },
    });

    const updatedAccount = (await Accounts.findByPk(account.id))!;
    const transactions = await Transactions.findAll({ where: { accountId: account.id }, raw: true });

    const adjustments = transactions.filter(
      (tx) => tx.transferNature === TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
    );
    expect(adjustments.length).toBe(0);

    expect(updatedAccount.currentBalance.toNumber()).toBe(1100);
    // The unexplainable +100 must land in initialBalance, not in a visible row.
    expect(updatedAccount.initialBalance.toNumber()).toBe(1100);
    expect(updatedAccount.initialBalance.toCents() + sumSignedCents(transactions)).toBe(
      updatedAccount.currentBalance.toCents(),
    );

    // The USD opening balance moved, so its base-currency stamp must be re-derived
    // rather than left on the pre-link value.
    expect(updatedAccount.refInitialBalance).not.toBeNull();
    expect(updatedAccount.refInitialBalance.toCents()).not.toBe(preLinkAccount.refInitialBalance.toCents());
    expect(updatedAccount.refInitialBalance.toCents()).toBeGreaterThan(preLinkAccount.refInitialBalance.toCents());

    // The restamp cascade shifts every Balances row, including today's — which the
    // sync pinned to the bank's authoritative balance. It has to stay pinned.
    const todayRow = await readTodayBalanceRow({ accountId: account.id });
    expect(todayRow).not.toBeNull();
    expect(todayRow!.amount.toCents()).toBe(updatedAccount.refCurrentBalance.toCents());
  });

  it('keeps the ledger intact across an unlink → relink cycle with unchanged bank state', async () => {
    const bankTransactions = getMockedLunchFlowTransactions(1);
    bankTransactions.transactions[0]!.amount = asDecimal(100);
    bankTransactions.transactions[0]!.date = subDays(new Date(), 1).toISOString();

    const { account } = await setupLinkedScenario({
      initialBalance: 1000,
      bankBalance: 1100,
      bankTransactions,
    });

    await helpers.unlinkAccountFromBankConnection({ id: account.id, raw: true });

    // Same bank state: same transactions, same balance.
    const { connections } = await helpers.bankDataProviders.listUserConnections({ raw: true });
    global.mswMockServer.use(
      getLunchFlowTransactionsMock({ response: bankTransactions, accountId: LUNCHFLOW_EXTERNAL_ACCOUNT_ID }),
      mockBankBalance({ amount: 1100 }),
    );

    const relinkResponse = await helpers.linkAccountToBankConnection({
      id: account.id,
      connectionId: connections[0]!.id,
      externalAccountId: LUNCHFLOW_EXTERNAL_ACCOUNT_ID,
      raw: false,
    });
    expect(relinkResponse.statusCode).toBe(200);

    const updatedAccount = (await Accounts.findByPk(account.id))!;
    const transactions = await Transactions.findAll({ where: { accountId: account.id }, raw: true });

    const adjustments = transactions.filter(
      (tx) => tx.transferNature === TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
    );
    expect(adjustments.length).toBe(0);

    // The gap income must not be duplicated by the relink sync.
    const nonAdjustment = transactions.filter(
      (tx) => tx.transferNature !== TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
    );
    expect(nonAdjustment.length).toBe(1);

    expect(updatedAccount.currentBalance.toNumber()).toBe(1100);
    expect(updatedAccount.initialBalance.toCents() + sumSignedCents(transactions)).toBe(
      updatedAccount.currentBalance.toCents(),
    );
  });

  // Loan and vehicle balances are owned by their dedicated flows, so a bank sync
  // force-writing `currentBalance` would desync the managed anchor.
  describe('dedicated-flow accounts are rejected up front', () => {
    const connectLunchFlow = async () => {
      await helpers.addUserCurrencies({ currencyCodes: ['USD'], raw: true });
      const { connectionId } = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });
      return connectionId;
    };

    const expectLinkRejected = async ({ accountId, connectionId }: { accountId: string; connectionId: string }) => {
      const response = await helpers.linkAccountToBankConnection({
        id: accountId,
        connectionId,
        externalAccountId: LUNCHFLOW_EXTERNAL_ACCOUNT_ID,
        raw: false,
      });

      expect(response.statusCode).toBe(422);
      expect(extractError(response).code).toBe(API_ERROR_CODES.validationError);
    };

    it('rejects linking a loan-category account', async () => {
      const connectionId = await connectLunchFlow();
      const loan = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({
          currencyCode: 'USD',
          initialBalance: 1_000,
          originalPrincipal: 1_000,
        }),
        raw: true,
      });

      await expectLinkRejected({ accountId: loan.id, connectionId });
    });

    it('rejects linking a vehicle-category account', async () => {
      const connectionId = await connectLunchFlow();
      const vehicle = await helpers.createVehicle({
        name: 'Toyota Camry 2020',
        currencyCode: 'USD',
        make: 'Toyota',
        model: 'Camry',
        year: 2020,
        vehicleClass: VEHICLE_CLASS.sedan,
        purchasePrice: 25_000,
        purchaseDate: format(subYears(new Date(), 3), 'yyyy-MM-dd'),
        raw: true,
      });

      await expectLinkRejected({ accountId: vehicle.accountId, connectionId });
    });
  });
});
