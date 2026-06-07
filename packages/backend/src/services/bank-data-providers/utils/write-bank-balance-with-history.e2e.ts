import { describe, expect, it } from '@jest/globals';
import Balances from '@models/balances.model';
import * as helpers from '@tests/helpers';

/**
 * Regression coverage for the `writeBankBalanceWithHistory` helper.
 *
 * Before extraction, LunchFlow and Walutomat only updated `Accounts.currentBalance`
 * after a sync — they never recomputed `refCurrentBalance` and never wrote a
 * `Balances` row, leaving the analytics chart flat for those providers.
 * Monobank's `refreshBalance` had the same gap (TODO comment from day one).
 *
 * Each test below exercises a sync through its provider's normal mocked flow
 * and asserts that (a) a `Balances` row exists for today and (b)
 * `refCurrentBalance` is set on the account — the two things the prior code
 * silently skipped.
 */
const todayIso = (): string => new Date().toISOString().slice(0, 10);

const expectBalanceHistoryWrittenForToday = async (accountId: string): Promise<void> => {
  const balances = await Balances.findAll({ where: { accountId } });
  expect(balances.some((b) => new Date(b.date).toISOString().slice(0, 10) === todayIso())).toBe(true);
};

describe('writeBankBalanceWithHistory (bank-provider balance writer)', () => {
  it('LunchFlow sync writes a Balance row for today and a non-zero refCurrentBalance', async () => {
    const { account } = await helpers.lunchflow.mockTransactions();

    const refreshed = await helpers.getAccount({ id: account.id, raw: true });
    // Pre-fix: refCurrentBalance was left at 0; the chart row was missing.
    expect(Number(refreshed.refCurrentBalance)).toBeGreaterThan(0);
    await expectBalanceHistoryWrittenForToday(account.id);
  });

  it('Walutomat sync writes a Balance row for today and a non-zero refCurrentBalance', async () => {
    const { account } = await helpers.walutomat.mockTransactions();

    const refreshed = await helpers.getAccount({ id: account.id, raw: true });
    expect(Number(refreshed.refCurrentBalance)).toBeGreaterThan(0);
    await expectBalanceHistoryWrittenForToday(account.id);
  });

  it('Monobank sync writes a Balance row for today and a non-zero refCurrentBalance', async () => {
    const { account } = await helpers.monobank.mockTransactions();

    const refreshed = await helpers.getAccount({ id: account.id, raw: true });
    expect(Number(refreshed.refCurrentBalance)).toBeGreaterThan(0);
    await expectBalanceHistoryWrittenForToday(account.id);
  });
});
