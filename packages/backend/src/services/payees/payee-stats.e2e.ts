import {
  type RecordId,
  RESOURCE_TYPES,
  SHARE_PERMISSIONS,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
} from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

/**
 * Payee stats report real money movement on visible accounts. Three row kinds
 * carry a `payeeId` yet must not contribute to count / net flow / first-last
 * seen: transfer legs (the link keeps `payeeId` on purpose — the filter is
 * read-side), planned rows, and rows on `excludeFromStats` accounts.
 *
 * Asserted through both surfaces that expose stats: `GET /payees/:id` and
 * `GET /payees`, plus the list's stats-driven ordering.
 */

const toMs = (value: unknown) => new Date(value as string).getTime();

const makePayee = ({ name }: { name: string }) =>
  helpers.createPayee({ payload: helpers.buildPayeePayload({ name }), raw: true });

const createExpense = async ({
  accountId,
  payeeId,
  amount,
  time,
}: {
  accountId: RecordId;
  payeeId?: RecordId;
  amount: number;
  time: string;
}) => {
  const [tx] = await helpers.createTransaction({
    payload: helpers.buildTransactionPayload({
      accountId,
      amount,
      time,
      payeeId,
      transactionType: TRANSACTION_TYPES.expense,
    }),
    raw: true,
  });
  return tx!;
};

const createIncome = async ({ accountId, amount, time }: { accountId: RecordId; amount: number; time: string }) => {
  const [tx] = await helpers.createTransaction({
    payload: helpers.buildTransactionPayload({
      accountId,
      amount,
      time,
      transactionType: TRANSACTION_TYPES.income,
    }),
    raw: true,
  });
  return tx!;
};

/** Stats as served by the single-payee endpoint and by the list endpoint. */
const readStats = async ({ payeeId }: { payeeId: RecordId }) => {
  const detail = await helpers.getPayeeById({ id: payeeId, raw: true });
  const list = await helpers.listPayees({ raw: true });
  const listed = list.find((row) => row.id === payeeId);

  expect(detail.stats).not.toBeNull();
  expect(listed).toBeDefined();
  expect(listed!.stats).not.toBeNull();

  return { detail: detail.stats!, list: listed!.stats! };
};

describe('Payee stats — rows that must not be counted', () => {
  describe('transfer legs', () => {
    it('ignores a transfer leg that kept its payee link', async () => {
      // 2 real expenses (100 each) + 1 expense that later becomes a transfer
      // leg (70, latest of the three) → count 2, net -200, lastSeen = 2nd real.
      const payee = await makePayee({ name: 'Transfer Leg Co' });
      const accountA = await helpers.createAccount({ raw: true });
      const accountB = await helpers.createAccount({ raw: true });

      const firstReal = await createExpense({
        accountId: accountA.id,
        payeeId: payee.id,
        amount: 100,
        time: '2024-03-10T12:00:00.000Z',
      });
      const lastReal = await createExpense({
        accountId: accountA.id,
        payeeId: payee.id,
        amount: 100,
        time: '2024-03-12T12:00:00.000Z',
      });

      const legExpense = await createExpense({
        accountId: accountA.id,
        payeeId: payee.id,
        amount: 70,
        time: '2024-06-01T12:00:00.000Z',
      });
      const legIncome = await createIncome({
        accountId: accountB.id,
        amount: 70,
        time: '2024-06-01T12:00:00.000Z',
      });
      await helpers.linkTransactions({
        payload: { ids: [[legIncome.id, legExpense.id]] },
        raw: true,
      });

      const legAfterLink = await helpers.getTransactionById({ id: legExpense.id, raw: true });
      expect(legAfterLink!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.common_transfer);
      expect(legAfterLink!.payeeId).toBe(payee.id);

      const { detail, list } = await readStats({ payeeId: payee.id });

      expect(detail.transactionCount).toBe(2);
      expect(detail.netFlowRef).toBe(-200);
      expect(toMs(detail.firstSeenAt)).toBe(toMs(firstReal.time));
      expect(toMs(detail.lastSeenAt)).toBe(toMs(lastReal.time));

      expect(list.transactionCount).toBe(2);
      expect(list.netFlowRef).toBe(-200);
      expect(toMs(list.lastSeenAt)).toBe(toMs(lastReal.time));
    });
  });

  describe('planned transactions', () => {
    it('ignores a planned transaction linked to the payee', async () => {
      // 2 real expenses (100 each) + 1 planned expense (40, future-dated)
      // → count 2, net -200, lastSeen = 2nd real, not the plan.
      const payee = await makePayee({ name: 'Planned Diner' });
      const account = await helpers.createAccount({ raw: true });

      const firstReal = await createExpense({
        accountId: account.id,
        payeeId: payee.id,
        amount: 100,
        time: '2024-03-10T12:00:00.000Z',
      });
      const lastReal = await createExpense({
        accountId: account.id,
        payeeId: payee.id,
        amount: 100,
        time: '2024-03-12T12:00:00.000Z',
      });

      const [planned] = await helpers.createPlannedTransaction({
        payload: {
          accountId: account.id,
          payeeId: payee.id,
          amount: 40,
          time: '2030-01-05T12:00:00.000Z',
          transactionType: TRANSACTION_TYPES.expense,
        },
        raw: true,
      });
      const plannedAfterCreate = await helpers.getTransactionById({ id: planned!.id, raw: true });
      expect(plannedAfterCreate!.isPlanned).toBe(true);
      expect(plannedAfterCreate!.payeeId).toBe(payee.id);

      const { detail, list } = await readStats({ payeeId: payee.id });

      expect(detail.transactionCount).toBe(2);
      expect(detail.netFlowRef).toBe(-200);
      expect(toMs(detail.firstSeenAt)).toBe(toMs(firstReal.time));
      expect(toMs(detail.lastSeenAt)).toBe(toMs(lastReal.time));

      expect(list.transactionCount).toBe(2);
      expect(list.netFlowRef).toBe(-200);
      expect(toMs(list.lastSeenAt)).toBe(toMs(lastReal.time));
    });
  });

  describe('accounts excluded from stats', () => {
    it('ignores a transaction on an excludeFromStats account', async () => {
      // 2 real expenses (100 each) on a visible account + 1 expense (60, the
      // earliest) on a hidden account → count 2, net -200, firstSeen = 1st
      // visible expense.
      const payee = await makePayee({ name: 'Hidden Account Co' });
      const visibleAccount = await helpers.createAccount({ raw: true });
      const hiddenAccount = await helpers.createAccount({ raw: true });

      const firstVisible = await createExpense({
        accountId: visibleAccount.id,
        payeeId: payee.id,
        amount: 100,
        time: '2024-03-10T12:00:00.000Z',
      });
      const lastVisible = await createExpense({
        accountId: visibleAccount.id,
        payeeId: payee.id,
        amount: 100,
        time: '2024-03-12T12:00:00.000Z',
      });

      await createExpense({
        accountId: hiddenAccount.id,
        payeeId: payee.id,
        amount: 60,
        time: '2024-01-05T12:00:00.000Z',
      });
      await helpers.updateAccount({
        id: hiddenAccount.id,
        payload: { excludeFromStats: true },
        raw: true,
      });

      const { detail, list } = await readStats({ payeeId: payee.id });

      expect(detail.transactionCount).toBe(2);
      expect(detail.netFlowRef).toBe(-200);
      expect(toMs(detail.firstSeenAt)).toBe(toMs(firstVisible.time));
      expect(toMs(detail.lastSeenAt)).toBe(toMs(lastVisible.time));

      expect(list.transactionCount).toBe(2);
      expect(list.netFlowRef).toBe(-200);
      expect(toMs(list.firstSeenAt)).toBe(toMs(firstVisible.time));
    });
  });

  describe('shared-account scoping', () => {
    // A single-account recipient must only ever see the owner's stats for the
    // account shared with them. Aggregating across the owner's other (unshared)
    // accounts would leak net flow, counts, and first/last-seen from private
    // accounts the recipient was never granted.
    const shareAccountReadOnly = async ({ accountId, recipientEmail }: { accountId: string; recipientEmail: string }) =>
      helpers.createShareInvitation({
        inviteeEmail: recipientEmail,
        resourceType: RESOURCE_TYPES.account,
        resourceId: accountId,
        permission: SHARE_PERMISSIONS.read,
        raw: true,
      });

    it("scopes a recipient's payee stats to the shared account only", async () => {
      const sharedAccount = await helpers.createAccount({ raw: true });
      const privateAccount = await helpers.createAccount({ raw: true });

      // Active on BOTH accounts: shared side is 2 expenses of 100 (net -200,
      // lastSeen 2024-05-02), plus one 500 expense on the private account.
      const sharedScopePayee = await makePayee({ name: 'Shared Scope Co' });
      await createExpense({
        accountId: sharedAccount.id,
        payeeId: sharedScopePayee.id,
        amount: 100,
        time: '2024-05-01T12:00:00.000Z',
      });
      const lastShared = await createExpense({
        accountId: sharedAccount.id,
        payeeId: sharedScopePayee.id,
        amount: 100,
        time: '2024-05-02T12:00:00.000Z',
      });
      await createExpense({
        accountId: privateAccount.id,
        payeeId: sharedScopePayee.id,
        amount: 500,
        time: '2024-05-10T12:00:00.000Z',
      });

      // Active ONLY on the private account — must not surface to the recipient.
      const privateOnlyPayee = await makePayee({ name: 'Private Only Co' });
      await createExpense({
        accountId: privateAccount.id,
        payeeId: privateOnlyPayee.id,
        amount: 300,
        time: '2024-05-03T12:00:00.000Z',
      });

      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const invitation = await shareAccountReadOnly({
        accountId: sharedAccount.id,
        recipientEmail: recipient.email,
      });
      await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.acceptShareInvitation({ token: invitation.token, raw: true }),
      });

      const recipientList = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.listPayees({ accountId: sharedAccount.id, raw: true }),
      });

      const recipientShared = recipientList.find((row) => row.id === sharedScopePayee.id);
      expect(recipientShared).toBeDefined();
      expect(recipientShared!.stats).not.toBeNull();
      expect(recipientShared!.stats!.transactionCount).toBe(2);
      expect(recipientShared!.stats!.netFlowRef).toBe(-200);
      expect(toMs(recipientShared!.stats!.lastSeenAt)).toBe(toMs(lastShared.time));

      // The owner's full payee namespace stays visible so the recipient's picker can
      // resolve it, but a payee with no shared-account activity carries no stats —
      // none of the owner's private-account figures leak through.
      const recipientPrivate = recipientList.find((row) => row.id === privateOnlyPayee.id);
      expect(recipientPrivate).toBeDefined();
      expect(recipientPrivate!.stats).toBeNull();

      // Owner's own list still aggregates across all their accounts.
      const ownerList = await helpers.listPayees({ raw: true });
      const ownerShared = ownerList.find((row) => row.id === sharedScopePayee.id);
      expect(ownerShared!.stats!.transactionCount).toBe(3);
      expect(ownerShared!.stats!.netFlowRef).toBe(-700);
      expect(ownerList.some((row) => row.id === privateOnlyPayee.id)).toBe(true);
    });
  });

  describe('GET /payees ordering', () => {
    it('orders by transactionCount over countable rows only', async () => {
      // Alpha: 3 real. Beta: 2 real + 1 planned + 1 transfer leg + 1 row on a
      // hidden account. Counting everything puts Beta (5) ahead of Alpha (3);
      // counting only real visible money puts Alpha (3) ahead of Beta (2).
      const alpha = await makePayee({ name: 'Sort Alpha' });
      const beta = await makePayee({ name: 'Sort Beta' });
      const account = await helpers.createAccount({ raw: true });
      const otherAccount = await helpers.createAccount({ raw: true });
      const hiddenAccount = await helpers.createAccount({ raw: true });

      for (const day of ['2024-02-01', '2024-02-02', '2024-02-03']) {
        await createExpense({
          accountId: account.id,
          payeeId: alpha.id,
          amount: 100,
          time: `${day}T12:00:00.000Z`,
        });
      }

      for (const day of ['2024-02-01', '2024-02-02']) {
        await createExpense({
          accountId: account.id,
          payeeId: beta.id,
          amount: 100,
          time: `${day}T12:00:00.000Z`,
        });
      }
      await helpers.createPlannedTransaction({
        payload: {
          accountId: account.id,
          payeeId: beta.id,
          amount: 100,
          time: '2030-02-03T12:00:00.000Z',
          transactionType: TRANSACTION_TYPES.expense,
        },
        raw: true,
      });
      const betaLegExpense = await createExpense({
        accountId: account.id,
        payeeId: beta.id,
        amount: 100,
        time: '2024-02-04T12:00:00.000Z',
      });
      const betaLegIncome = await createIncome({
        accountId: otherAccount.id,
        amount: 100,
        time: '2024-02-04T12:00:00.000Z',
      });
      await helpers.linkTransactions({
        payload: { ids: [[betaLegIncome.id, betaLegExpense.id]] },
        raw: true,
      });
      await createExpense({
        accountId: hiddenAccount.id,
        payeeId: beta.id,
        amount: 100,
        time: '2024-02-05T12:00:00.000Z',
      });
      await helpers.updateAccount({
        id: hiddenAccount.id,
        payload: { excludeFromStats: true },
        raw: true,
      });

      const list = await helpers.listPayees({ raw: true });
      const names = list.map((row) => row.name);

      expect(names.indexOf('Sort Alpha')).toBeGreaterThanOrEqual(0);
      expect(names.indexOf('Sort Alpha')).toBeLessThan(names.indexOf('Sort Beta'));

      expect(list.find((row) => row.id === alpha.id)!.stats!.transactionCount).toBe(3);
      expect(list.find((row) => row.id === beta.id)!.stats!.transactionCount).toBe(2);
    });
  });
});
