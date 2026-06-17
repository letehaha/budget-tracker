import { PAYMENT_REMINDER_STATUSES, SUBSCRIPTION_FREQUENCIES, TRANSACTION_TYPES } from '@bt/shared/types';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { addMonths, format } from 'date-fns';

/** Returns a date string N months from today, on the given day-of-month. */
function futureDate({ monthsAhead, day }: { monthsAhead: number; day: number }): string {
  const d = addMonths(new Date(), monthsAhead);
  d.setDate(day);
  return format(d, 'yyyy-MM-dd');
}

/** Pays the current upcoming/overdue period of a reminder and returns the refreshed period list. */
async function payCurrentPeriod({ reminderId, periodId }: { reminderId: string; periodId: string }) {
  await helpers.markPaymentReminderPeriodPaid({ reminderId, periodId, raw: true });
  return helpers.getPaymentReminderPeriods({ reminderId, raw: true });
}

describe('Scheduled Payments (installments + account link)', () => {
  describe('maxOccurrences auto-stop', () => {
    it('stops generating periods and deactivates the reminder after the cap is reached', async () => {
      const reminder = await helpers.createPaymentReminder({
        name: 'Loan Installments',
        dueDate: futureDate({ monthsAhead: 1, day: 1 }),
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        maxOccurrences: 3,
        raw: true,
      });

      // Creation auto-makes period #1.
      expect(reminder.maxOccurrences).toBe(3);
      expect(reminder.periods).toHaveLength(1);

      // Pay #1 -> #2 exists.
      let periods = await payCurrentPeriod({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
      });
      expect(periods.total).toBe(2);
      let upcoming = periods.periods.find((p) => p.status === PAYMENT_REMINDER_STATUSES.upcoming);
      expect(upcoming).toBeDefined();

      // Pay #2 -> #3 exists.
      periods = await payCurrentPeriod({ reminderId: reminder.id, periodId: upcoming!.id });
      expect(periods.total).toBe(3);
      upcoming = periods.periods.find((p) => p.status === PAYMENT_REMINDER_STATUSES.upcoming);
      expect(upcoming).toBeDefined();

      // Pay #3 -> NO #4, and the reminder is now inactive.
      periods = await payCurrentPeriod({ reminderId: reminder.id, periodId: upcoming!.id });
      expect(periods.total).toBe(3);
      expect(periods.periods.find((p) => p.status === PAYMENT_REMINDER_STATUSES.upcoming)).toBeUndefined();

      const after = await helpers.getPaymentReminderById({ id: reminder.id, raw: true });
      expect(after.isActive).toBe(false);
      expect(after.periods).toHaveLength(3);
      expect(after.periods.every((p) => p.status === PAYMENT_REMINDER_STATUSES.paid)).toBe(true);
    });

    it('counts a skipped period toward the cap', async () => {
      const reminder = await helpers.createPaymentReminder({
        name: 'Skip Counts',
        dueDate: futureDate({ monthsAhead: 1, day: 1 }),
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        maxOccurrences: 2,
        raw: true,
      });

      // Skip #1 -> #2 generated (cap not yet reached: 1 < 2).
      await helpers.skipPaymentReminderPeriod({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        raw: true,
      });

      let periods = await helpers.getPaymentReminderPeriods({ reminderId: reminder.id, raw: true });
      expect(periods.total).toBe(2);
      const second = periods.periods.find((p) => p.status === PAYMENT_REMINDER_STATUSES.upcoming);
      expect(second).toBeDefined();

      // Pay #2 -> cap (2) reached: no #3, reminder deactivated.
      await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: second!.id,
        raw: true,
      });

      periods = await helpers.getPaymentReminderPeriods({ reminderId: reminder.id, raw: true });
      expect(periods.total).toBe(2);
      expect(periods.periods.find((p) => p.status === PAYMENT_REMINDER_STATUSES.upcoming)).toBeUndefined();

      const after = await helpers.getPaymentReminderById({ id: reminder.id, raw: true });
      expect(after.isActive).toBe(false);
    });

    it('reactivates a capped reminder when a consumed period is reverted', async () => {
      const reminder = await helpers.createPaymentReminder({
        name: 'Revert Reopens',
        dueDate: futureDate({ monthsAhead: 1, day: 1 }),
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        maxOccurrences: 1,
        raw: true,
      });

      const periodId = reminder.periods[0]!.id;

      // Pay the only allowed period -> cap (1) reached, reminder deactivated.
      await helpers.markPaymentReminderPeriodPaid({ reminderId: reminder.id, periodId, raw: true });

      let after = await helpers.getPaymentReminderById({ id: reminder.id, raw: true });
      expect(after.isActive).toBe(false);
      expect(after.periods).toHaveLength(1);

      // Revert that period -> schedule re-opens, reminder reactivated.
      const reverted = await helpers.revertPaymentReminderPeriod({
        reminderId: reminder.id,
        periodId,
        raw: true,
      });
      expect(reverted.status).toBe(PAYMENT_REMINDER_STATUSES.upcoming);

      after = await helpers.getPaymentReminderById({ id: reminder.id, raw: true });
      expect(after.isActive).toBe(true);
      expect(after.periods).toHaveLength(1);
      expect(after.periods[0]!.status).toBe(PAYMENT_REMINDER_STATUSES.upcoming);
    });
  });

  describe('indefinite (no maxOccurrences)', () => {
    it('always keeps an upcoming period and stays active', async () => {
      const reminder = await helpers.createPaymentReminder({
        name: 'Forever Rent',
        dueDate: futureDate({ monthsAhead: 1, day: 1 }),
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        raw: true,
      });

      expect(reminder.maxOccurrences).toBeNull();

      // Pay two periods in a row.
      let periods = await payCurrentPeriod({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
      });
      let upcoming = periods.periods.find((p) => p.status === PAYMENT_REMINDER_STATUSES.upcoming);
      expect(upcoming).toBeDefined();

      periods = await payCurrentPeriod({ reminderId: reminder.id, periodId: upcoming!.id });
      upcoming = periods.periods.find((p) => p.status === PAYMENT_REMINDER_STATUSES.upcoming);
      expect(upcoming).toBeDefined();
      expect(periods.total).toBe(3);

      const after = await helpers.getPaymentReminderById({ id: reminder.id, raw: true });
      expect(after.isActive).toBe(true);
    });
  });

  describe('accountId plumbing', () => {
    it('rejects creation with a non-existent accountId', async () => {
      const res = await helpers.createPaymentReminder({
        name: 'Bad Account',
        dueDate: futureDate({ monthsAhead: 1, day: 1 }),
        accountId: generateRandomRecordId(),
        raw: false,
      });

      expect(res.statusCode).toBe(404);
    });

    it("rejects creation with another user's accountId", async () => {
      // Create an account owned by a second user via the canonical multi-user helpers
      // (asUser actually re-scopes the request to that user's session).
      const secondUser = await helpers.signUpSecondUser();
      let foreignAccountId: string | null = null;
      await helpers.asUser({
        cookies: secondUser.cookies,
        fn: async () => {
          await helpers.setBaseCurrencyForActiveUser({ currencyCode: global.BASE_CURRENCY.code });
          const foreignAccount = await helpers.createAccount({ raw: true });
          foreignAccountId = foreignAccount.id;
        },
      });

      const res = await helpers.createPaymentReminder({
        name: 'Foreign Account',
        dueDate: futureDate({ monthsAhead: 1, day: 1 }),
        accountId: foreignAccountId!,
        raw: false,
      });

      expect(res.statusCode).toBe(404);
    });

    it('persists and returns accountId when a valid own account is linked', async () => {
      const account = await helpers.createAccount({ raw: true });

      const reminder = await helpers.createPaymentReminder({
        name: 'With Account',
        dueDate: futureDate({ monthsAhead: 1, day: 1 }),
        accountId: account.id,
        raw: true,
      });

      expect(reminder.accountId).toBe(account.id);

      const detail = await helpers.getPaymentReminderById({ id: reminder.id, raw: true });
      expect(detail.accountId).toBe(account.id);
    });
  });
});

describe('Scheduled Payments (create transaction on pay)', () => {
  describe('POST /payment-reminders/:id/periods/:periodId/pay with createTransaction', () => {
    it('creates an expense transaction from the reminder and links it to the period', async () => {
      const account = await helpers.createAccount({ raw: true });
      const reminder = await helpers.createPaymentReminder({
        name: 'Internet Bill',
        dueDate: futureDate({ monthsAhead: 1, day: 1 }),
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        accountId: account.id,
        categoryId: global.DEFAULT_CATEGORY_ID,
        expectedAmount: 42.5,
        currencyCode: global.BASE_CURRENCY.code,
        raw: true,
      });

      const period = await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        createTransaction: true,
        raw: true,
      });

      // Period is paid and points at the created transaction.
      expect(period.status).toBe(PAYMENT_REMINDER_STATUSES.paid);
      expect(period.transactionId).toBeTruthy();

      // The linked transaction matches the reminder (expense, account, category, amount).
      const tx = await helpers.getTransactionById({ id: period.transactionId!, raw: true });
      expect(tx).not.toBeNull();
      expect(tx!.transactionType).toBe(TRANSACTION_TYPES.expense);
      expect(tx!.accountId).toBe(account.id);
      expect(tx!.categoryId).toBe(global.DEFAULT_CATEGORY_ID);
      expect(tx!.amount).toBe(42.5);

      // The next recurring period was generated.
      const periods = await helpers.getPaymentReminderPeriods({ reminderId: reminder.id, raw: true });
      expect(periods.periods.find((p) => p.status === PAYMENT_REMINDER_STATUSES.upcoming)).toBeDefined();
    });

    it('uses the amount override instead of the reminder expectedAmount', async () => {
      const account = await helpers.createAccount({ raw: true });
      const reminder = await helpers.createPaymentReminder({
        name: 'Variable Power Bill',
        dueDate: futureDate({ monthsAhead: 1, day: 1 }),
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        accountId: account.id,
        categoryId: global.DEFAULT_CATEGORY_ID,
        expectedAmount: 100,
        currencyCode: global.BASE_CURRENCY.code,
        raw: true,
      });

      const period = await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        createTransaction: true,
        amount: 73.21,
        raw: true,
      });

      const tx = await helpers.getTransactionById({ id: period.transactionId!, raw: true });
      expect(tx!.amount).toBe(73.21);
    });

    it('uses the time override for the created transaction', async () => {
      const account = await helpers.createAccount({ raw: true });
      const reminder = await helpers.createPaymentReminder({
        name: 'Backdated Bill',
        dueDate: futureDate({ monthsAhead: 1, day: 1 }),
        accountId: account.id,
        categoryId: global.DEFAULT_CATEGORY_ID,
        expectedAmount: 10,
        currencyCode: global.BASE_CURRENCY.code,
        raw: true,
      });

      const paidOn = '2024-01-15T00:00:00.000Z';
      const period = await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        createTransaction: true,
        time: paidOn,
        raw: true,
      });

      const tx = await helpers.getTransactionById({ id: period.transactionId!, raw: true });
      expect(new Date(tx!.time).toISOString()).toBe(paidOn);
    });

    it('rejects create-mode for a variable-amount reminder when no amount override is given', async () => {
      const account = await helpers.createAccount({ raw: true });
      const reminder = await helpers.createPaymentReminder({
        name: 'No Amount',
        dueDate: futureDate({ monthsAhead: 1, day: 1 }),
        accountId: account.id,
        categoryId: global.DEFAULT_CATEGORY_ID,
        // expectedAmount omitted -> variable amount reminder.
        raw: true,
      });

      const res = await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        createTransaction: true,
        raw: false,
      });

      expect(res.statusCode).toBe(422);

      // The period stays unpaid since the create failed.
      const detail = await helpers.getPaymentReminderById({ id: reminder.id, raw: true });
      expect(detail.periods[0]!.status).not.toBe(PAYMENT_REMINDER_STATUSES.paid);
    });

    it('creates a transaction for a variable-amount reminder when an amount override is given', async () => {
      const account = await helpers.createAccount({ raw: true });
      const reminder = await helpers.createPaymentReminder({
        name: 'Variable With Override',
        dueDate: futureDate({ monthsAhead: 1, day: 1 }),
        accountId: account.id,
        categoryId: global.DEFAULT_CATEGORY_ID,
        raw: true,
      });

      const period = await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        createTransaction: true,
        amount: 55,
        raw: true,
      });

      expect(period.status).toBe(PAYMENT_REMINDER_STATUSES.paid);
      const tx = await helpers.getTransactionById({ id: period.transactionId!, raw: true });
      expect(tx!.amount).toBe(55);
    });

    it('rejects create-mode when the reminder has no account', async () => {
      const reminder = await helpers.createPaymentReminder({
        name: 'No Account',
        dueDate: futureDate({ monthsAhead: 1, day: 1 }),
        categoryId: global.DEFAULT_CATEGORY_ID,
        expectedAmount: 20,
        currencyCode: global.BASE_CURRENCY.code,
        raw: true,
      });

      const res = await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        createTransaction: true,
        raw: false,
      });

      expect(res.statusCode).toBe(422);

      const detail = await helpers.getPaymentReminderById({ id: reminder.id, raw: true });
      expect(detail.periods[0]!.status).not.toBe(PAYMENT_REMINDER_STATUSES.paid);
    });

    it('falls back to the user default category when the reminder has none', async () => {
      // The seeded user's `defaultCategoryId` is the "other" category, which is
      // not the same row as `global.DEFAULT_CATEGORY_ID` (an arbitrary main
      // category helpers use for tx payloads). Read the real default off the
      // user so the assertion tracks the actual fallback source.
      const me = await helpers.getUserInfo({ raw: true });
      expect(me.defaultCategoryId).toBeTruthy();

      const account = await helpers.createAccount({ raw: true });
      const reminder = await helpers.createPaymentReminder({
        name: 'No Category',
        dueDate: futureDate({ monthsAhead: 1, day: 1 }),
        accountId: account.id,
        // categoryId omitted -> falls back to the user's defaultCategoryId.
        expectedAmount: 30,
        currencyCode: global.BASE_CURRENCY.code,
        raw: true,
      });

      const period = await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        createTransaction: true,
        raw: true,
      });

      const tx = await helpers.getTransactionById({ id: period.transactionId!, raw: true });
      expect(tx!.categoryId).toBe(me.defaultCategoryId);
    });

    it('rejects when createTransaction is combined with a transactionId', async () => {
      const account = await helpers.createAccount({ raw: true });
      const existingTx = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id }),
        raw: true,
      });

      const reminder = await helpers.createPaymentReminder({
        name: 'Mutually Exclusive',
        dueDate: futureDate({ monthsAhead: 1, day: 1 }),
        accountId: account.id,
        categoryId: global.DEFAULT_CATEGORY_ID,
        expectedAmount: 15,
        currencyCode: global.BASE_CURRENCY.code,
        raw: true,
      });

      const res = await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        createTransaction: true,
        transactionId: existingTx[0]!.id,
        raw: false,
      });

      expect(res.statusCode).toBe(422);
    });

    it('still supports linking an existing transaction (backward compatible)', async () => {
      const account = await helpers.createAccount({ raw: true });
      const existingTx = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id }),
        raw: true,
      });

      const reminder = await helpers.createPaymentReminder({
        name: 'Link Existing',
        dueDate: futureDate({ monthsAhead: 1, day: 1 }),
        accountId: account.id,
        categoryId: global.DEFAULT_CATEGORY_ID,
        expectedAmount: 15,
        currencyCode: global.BASE_CURRENCY.code,
        raw: true,
      });

      const period = await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        transactionId: existingTx[0]!.id,
        raw: true,
      });

      expect(period.status).toBe(PAYMENT_REMINDER_STATUSES.paid);
      expect(period.transactionId).toBe(existingTx[0]!.id);
    });
  });
});

describe('Scheduled Payments (revert deletes generated transaction)', () => {
  describe('POST /payment-reminders/:id/periods/:periodId/revert', () => {
    it('decreases the account balance and creates a transaction when paying in create-mode', async () => {
      // initialBalance is a decimal here; the API reports currentBalance as a decimal too.
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance: 1000 }),
        raw: true,
      });
      expect(account.currentBalance).toBe(1000);

      const reminder = await helpers.createPaymentReminder({
        name: 'Internet Bill',
        dueDate: futureDate({ monthsAhead: 1, day: 1 }),
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        accountId: account.id,
        categoryId: global.DEFAULT_CATEGORY_ID,
        expectedAmount: 250,
        currencyCode: global.BASE_CURRENCY.code,
        raw: true,
      });

      const period = await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        createTransaction: true,
        raw: true,
      });

      // The generated expense exists and is flagged as auto-created.
      expect(period.transactionId).toBeTruthy();
      expect(period.transactionAutoCreated).toBe(true);

      const tx = await helpers.getTransactionById({ id: period.transactionId!, raw: true });
      expect(tx).not.toBeNull();
      expect(tx!.transactionType).toBe(TRANSACTION_TYPES.expense);
      expect(tx!.amount).toBe(250);

      // Expense reduced the account balance.
      const afterPay = await helpers.getAccount({ id: account.id, raw: true });
      expect(afterPay.currentBalance).toBe(750);
    });

    it('deletes the generated transaction and restores the balance on revert', async () => {
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance: 1000 }),
        raw: true,
      });

      const reminder = await helpers.createPaymentReminder({
        name: 'Electricity',
        dueDate: futureDate({ monthsAhead: 1, day: 1 }),
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        accountId: account.id,
        categoryId: global.DEFAULT_CATEGORY_ID,
        expectedAmount: 250,
        currencyCode: global.BASE_CURRENCY.code,
        raw: true,
      });

      const paidPeriod = await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        createTransaction: true,
        raw: true,
      });

      const generatedTxId = paidPeriod.transactionId!;
      expect(generatedTxId).toBeTruthy();
      expect((await helpers.getAccount({ id: account.id, raw: true })).currentBalance).toBe(750);

      const reverted = await helpers.revertPaymentReminderPeriod({
        reminderId: reminder.id,
        periodId: paidPeriod.id,
        raw: true,
      });

      // (a) The generated transaction is gone (the detail endpoint returns a null
      // body for a transaction the caller can no longer see).
      const txAfter = await helpers.getTransactionById({ id: generatedTxId, raw: true });
      expect(txAfter).toBeNull();

      // (b) The account balance is restored to its original value.
      const accountAfter = await helpers.getAccount({ id: account.id, raw: true });
      expect(accountAfter.currentBalance).toBe(1000);

      // (c) The period is active again with no transaction link and the flag cleared.
      expect([PAYMENT_REMINDER_STATUSES.upcoming, PAYMENT_REMINDER_STATUSES.overdue]).toContain(reverted.status);
      expect(reverted.transactionId).toBeNull();
      expect(reverted.transactionAutoCreated).toBe(false);
    });

    it('does NOT delete a manually linked transaction on revert', async () => {
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance: 1000 }),
        raw: true,
      });

      // A transaction the user created themselves and links in link-mode.
      const [manualTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 300 }),
        raw: true,
      });

      // The manual expense already reduced the balance.
      const afterManual = await helpers.getAccount({ id: account.id, raw: true });
      expect(afterManual.currentBalance).toBe(700);

      const reminder = await helpers.createPaymentReminder({
        name: 'Rent',
        dueDate: futureDate({ monthsAhead: 1, day: 1 }),
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        accountId: account.id,
        categoryId: global.DEFAULT_CATEGORY_ID,
        expectedAmount: 300,
        currencyCode: global.BASE_CURRENCY.code,
        raw: true,
      });

      const paidPeriod = await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        transactionId: manualTx.id,
        raw: true,
      });
      expect(paidPeriod.transactionId).toBe(manualTx.id);
      expect(paidPeriod.transactionAutoCreated).toBe(false);

      const reverted = await helpers.revertPaymentReminderPeriod({
        reminderId: reminder.id,
        periodId: paidPeriod.id,
        raw: true,
      });

      // The link is cleared on the period but the user's transaction survives.
      expect(reverted.transactionId).toBeNull();
      expect(reverted.transactionAutoCreated).toBe(false);

      const txAfter = await helpers.getTransactionById({ id: manualTx.id, raw: true });
      expect(txAfter).not.toBeNull();
      expect(txAfter!.amount).toBe(300);

      // Balance reflects ONLY the manual transaction (not double-counted, not restored).
      const accountAfter = await helpers.getAccount({ id: account.id, raw: true });
      expect(accountAfter.currentBalance).toBe(700);
    });

    it('reverts successfully when the generated transaction was already deleted manually', async () => {
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance: 1000 }),
        raw: true,
      });

      const reminder = await helpers.createPaymentReminder({
        name: 'Phone Bill',
        dueDate: futureDate({ monthsAhead: 1, day: 1 }),
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        accountId: account.id,
        categoryId: global.DEFAULT_CATEGORY_ID,
        expectedAmount: 250,
        currencyCode: global.BASE_CURRENCY.code,
        raw: true,
      });

      const paidPeriod = await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        createTransaction: true,
        raw: true,
      });
      const generatedTxId = paidPeriod.transactionId!;

      // The user deletes the generated transaction directly via the transactions endpoint.
      const deleteRes = await helpers.deleteTransaction({ id: generatedTxId });
      expect(deleteRes.statusCode).toBe(200);

      // Deleting the expense already restored the balance.
      expect((await helpers.getAccount({ id: account.id, raw: true })).currentBalance).toBe(1000);

      // Revert must not 500 even though the linked transaction is gone.
      const reverted = await helpers.revertPaymentReminderPeriod({
        reminderId: reminder.id,
        periodId: paidPeriod.id,
        raw: true,
      });

      expect([PAYMENT_REMINDER_STATUSES.upcoming, PAYMENT_REMINDER_STATUSES.overdue]).toContain(reverted.status);
      expect(reverted.transactionId).toBeNull();
      expect(reverted.transactionAutoCreated).toBe(false);

      // Balance unchanged (still restored), no double reversal.
      const accountAfter = await helpers.getAccount({ id: account.id, raw: true });
      expect(accountAfter.currentBalance).toBe(1000);
    });
  });
});

describe('Cross-currency scheduled payments', () => {
  /**
   * Links a UAH account to a reminder billed in the base currency (USD), so the
   * reminder currency differs from the account it is paid from.
   */
  async function createForeignReminderOnUahAccount({ expectedAmount }: { expectedAmount: number }) {
    const uah = global.MODELS_CURRENCIES!.find((c) => c.code === 'UAH')!;
    await helpers.addUserCurrencies({ currencyCodes: [uah.code] });
    const account = await helpers.createAccount({
      payload: { ...helpers.buildAccountPayload(), currencyCode: uah.code },
      raw: true,
    });
    const reminder = await helpers.createPaymentReminder({
      name: 'USD Subscription',
      dueDate: futureDate({ monthsAhead: 1, day: 1 }),
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      accountId: account.id,
      categoryId: global.DEFAULT_CATEGORY_ID,
      expectedAmount,
      // Billed in the base currency (USD), which differs from the UAH account.
      currencyCode: global.BASE_CURRENCY.code,
      raw: true,
    });
    return { account, reminder, accountCurrencyCode: uah.code };
  }

  describe('GET /payment-reminders/:id/pay-preview', () => {
    it('reports cross-currency and a converted estimate in the account currency', async () => {
      const { reminder, accountCurrencyCode } = await createForeignReminderOnUahAccount({ expectedAmount: 10 });

      const preview = await helpers.getPaymentReminderPayPreview({ id: reminder.id, raw: true });

      expect(preview.isCrossCurrency).toBe(true);
      expect(preview.accountCurrencyCode).toBe(accountCurrencyCode);
      expect(preview.reminderCurrencyCode).toBe(global.BASE_CURRENCY.code);
      expect(preview.expectedAmount).toBe(10);
      expect(preview.convertedAmount).not.toBeNull();
      // Converting USD -> UAH changes the figure away from the USD nominal.
      expect(preview.convertedAmount).not.toBe(10);
    });

    it('reports same-currency (no conversion) when the reminder currency matches the account', async () => {
      const account = await helpers.createAccount({ raw: true }); // base currency
      const reminder = await helpers.createPaymentReminder({
        name: 'Same Currency',
        dueDate: futureDate({ monthsAhead: 1, day: 1 }),
        accountId: account.id,
        categoryId: global.DEFAULT_CATEGORY_ID,
        expectedAmount: 20,
        currencyCode: global.BASE_CURRENCY.code,
        raw: true,
      });

      const preview = await helpers.getPaymentReminderPayPreview({ id: reminder.id, raw: true });

      expect(preview.isCrossCurrency).toBe(false);
      expect(preview.accountCurrencyCode).toBe(global.BASE_CURRENCY.code);
      expect(preview.convertedAmount).toBe(20);
    });

    it('returns 404 for a non-existent reminder', async () => {
      const res = await helpers.getPaymentReminderPayPreview({ id: generateRandomRecordId(), raw: false });
      expect(res.statusCode).toBe(404);
    });

    it("does not expose another user's reminder", async () => {
      const { reminder } = await createForeignReminderOnUahAccount({ expectedAmount: 10 });

      const secondUser = await helpers.signUpSecondUser();
      const res = await helpers.asUser({
        cookies: secondUser.cookies,
        fn: () => helpers.getPaymentReminderPayPreview({ id: reminder.id, raw: false }),
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /payment-reminders/:id/periods/:periodId/pay (cross-currency)', () => {
    it('books the converted account-currency amount when no override is given', async () => {
      const { account, reminder, accountCurrencyCode } = await createForeignReminderOnUahAccount({
        expectedAmount: 10,
      });

      // The estimate the pay dialog would pre-fill.
      const preview = await helpers.getPaymentReminderPayPreview({ id: reminder.id, raw: true });

      const period = await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        createTransaction: true,
        raw: true,
      });

      const tx = await helpers.getTransactionById({ id: period.transactionId!, raw: true });
      expect(tx).not.toBeNull();
      // Booked in the account's currency, not the reminder's billed currency.
      expect(tx!.currencyCode).toBe(accountCurrencyCode);
      expect(tx!.accountId).toBe(account.id);
      // The booked amount is the converted figure and matches the previewed estimate exactly.
      expect(tx!.amount).not.toBe(10);
      expect(tx!.amount).toBe(preview.convertedAmount);
    });

    it('books an explicit override verbatim in the account currency', async () => {
      const { account, reminder, accountCurrencyCode } = await createForeignReminderOnUahAccount({
        expectedAmount: 10,
      });

      const period = await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        createTransaction: true,
        amount: 415, // user-confirmed UAH amount from the dialog
        raw: true,
      });

      const tx = await helpers.getTransactionById({ id: period.transactionId!, raw: true });
      expect(tx!.amount).toBe(415);
      expect(tx!.currencyCode).toBe(accountCurrencyCode);
      expect(tx!.accountId).toBe(account.id);
    });
  });
});
