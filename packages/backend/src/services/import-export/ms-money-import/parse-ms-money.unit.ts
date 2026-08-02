/**
 * Runs against real Microsoft Money sample databases. They are not committed —
 * see `src/tests/fixtures/ms-money-fixtures.ts`. Without them the whole file
 * skips, so a checkout that never ran `npm run fixtures:ms-money` stays green.
 *
 * money2005-pwd and sunset-sample-pwd are the only samples with a real ledger in
 * them; the other seven hold nothing this importer brings across, so they are
 * used to pin the cipher variants and the "nothing to import" shape.
 */
import { MsMoneyAccountType, TRANSACTION_TYPES } from '@bt/shared/types';
import type { MsMoneyParseResult } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ValidationError } from '@js/errors';
import {
  MS_MONEY_FIXTURES,
  MS_MONEY_FIXTURES_MISSING_MESSAGE,
  msMoneyFixturesAvailable,
  readMsMoneyFixture,
} from '@tests/fixtures/ms-money-fixtures';

import { parseMsMoneyFile } from './parse-ms-money.service';

const hasFixtures = msMoneyFixturesAvailable();
if (!hasFixtures) console.warn(`[parse-ms-money.unit] skipped. ${MS_MONEY_FIXTURES_MISSING_MESSAGE}`);
const describeWithFixtures = hasFixtures ? describe : describe.skip;

const parseFixture = ({ file, password }: { file: string; password?: string | null }): MsMoneyParseResult =>
  parseMsMoneyFile({ buffer: readMsMoneyFixture({ file }), password });

const warningCount = ({ result, code }: { result: MsMoneyParseResult; code: string }): number =>
  result.warnings.find((warning) => warning.code === code)?.count ?? 0;

describeWithFixtures('parseMsMoneyFile', () => {
  describe('encryption variants', () => {
    it.each(MS_MONEY_FIXTURES)('reads $file, written with $encryption', ({ file, password, encryption }) => {
      const result = parseFixture({ file, password });

      expect(result.encryption).toBe(encryption);
      expect(result.warnings.every((warning) => warning.count > 0 && warning.message.length > 0)).toBe(true);
    });

    it('reads the one legacy-Jet sample, which holds no importable account', () => {
      const result = parseFixture({ file: 'money2001-pwd.mny', password: 'TEST12345' });

      expect(result.encryption).toBe('legacy-jet');
      expect(result.accounts).toEqual([]);
      expect(result.transactions).toEqual([]);
      expect(result.dateRange).toBeNull();
      expect(result.baseCurrency).toBeNull();
      // The one account in the file is an investment account, reported rather
      // than silently dropped.
      expect(warningCount({ result, code: 'account-type-unsupported' })).toBe(1);
    });
  });

  describe('money2005-pwd.mny', () => {
    const parse = () => parseFixture({ file: 'money2005-pwd.mny', password: '123@abc!' });

    it('finds the expected ledger', () => {
      const result = parse();

      expect(result.accounts).toHaveLength(3);
      expect(result.transactions).toHaveLength(68);
      expect(result.transfers).toHaveLength(7);
      expect(result.categories).toHaveLength(11);
      expect(result.payees).toHaveLength(10);
      expect(result.baseCurrency).toBe('AUD');
      expect(result.accounts.map((account) => account.originalName)).toEqual([
        'Stocks and Shares (Cash)',
        'Woodgrove Bank Credit Card',
        'Woodgrove Bank Current',
      ]);
      expect(result.accounts.every((account) => account.currency === 'AUD')).toBe(true);
    });

    it('reports the void rows it skipped', () => {
      const result = parse();

      expect(warningCount({ result, code: 'void-row-skipped' })).toBe(28);
      expect(result.warnings.find((warning) => warning.code === 'void-row-skipped')?.message).toContain('void');
    });

    it('covers the file date range with UTC-midnight instants', () => {
      const result = parse();

      expect(result.dateRange).toEqual({ from: '2003-08-02T00:00:00.000Z', to: '2004-12-02T00:00:00.000Z' });
      expect(result.transactions.every((tx) => tx.date.endsWith('T00:00:00.000Z'))).toBe(true);
    });

    it('carries the category path and payee through to a row', () => {
      const result = parse();
      const insurance = result.transactions.filter((tx) => tx.categoryName === 'Insurance:Home and Contents');

      expect(insurance.length).toBeGreaterThan(0);
      expect(insurance[0]).toMatchObject({
        accountName: 'Woodgrove Bank Current',
        payeeName: 'Hill Smiths',
        type: TRANSACTION_TYPES.expense,
        outOfWallet: false,
      });
      expect(insurance[0]!.amount).toBeLessThan(0);
    });

    it('counts each account and its net exactly once', () => {
      const result = parse();
      const current = result.accounts.find((account) => account.originalName === 'Woodgrove Bank Current')!;

      // Transfers count for both accounts they touch, so the account totals are
      // above the plain transaction count.
      const rowsForAccount =
        result.transactions.filter((tx) => tx.accountName === current.originalName).length +
        result.transfers.filter(
          (transfer) =>
            transfer.sourceAccountName === current.originalName ||
            transfer.destinationAccountName === current.originalName,
        ).length;

      expect(current.transactionCount).toBe(rowsForAccount);
      expect(current.accountType).toBe(MsMoneyAccountType.banking);
    });
  });

  describe('sunset-sample-pwd.mny', () => {
    const parse = () => parseFixture({ file: 'sunset-sample-pwd.mny', password: '123@abc!' });

    it('finds the expected ledger', () => {
      const result = parse();

      expect(result.accounts).toHaveLength(10);
      expect(result.transactions).toHaveLength(2441);
      expect(result.transfers).toHaveLength(601);
      expect(result.baseCurrency).toBe('USD');
      expect(result.dateRange).toEqual({ from: '2000-08-19T00:00:00.000Z', to: '2011-11-21T00:00:00.000Z' });
    });

    it('reports every kind of skip it made', () => {
      const result = parse();

      expect(warningCount({ result, code: 'account-type-unsupported' })).toBe(9);
      expect(warningCount({ result, code: 'void-row-skipped' })).toBe(45);
      expect(warningCount({ result, code: 'orphan-row-skipped' })).toBe(3);
      // Matches the rows actually emitted as out-of-wallet, so the number the
      // preview shows and the number of imported rows never disagree.
      expect(warningCount({ result, code: 'transfer-counterpart-not-imported' })).toBe(181);
      expect(result.transactions.filter((transaction) => transaction.outOfWallet)).toHaveLength(181);
      // Well under the cap, so no row was dropped for volume.
      expect(warningCount({ result, code: 'row-limit-reached' })).toBe(0);
    });

    it('lists only the categories and payees the imported rows actually use', () => {
      const result = parse();
      const usedCategories = new Set(
        result.transactions.map((tx) => tx.categoryName).filter((name): name is string => name !== null),
      );
      const usedPayees = new Set(
        result.transactions.map((tx) => tx.payeeName).filter((name): name is string => name !== null),
      );

      expect(result.categories.map((category) => category.fullName).toSorted()).toEqual([...usedCategories].toSorted());
      expect(result.payees.map((payee) => payee.name).toSorted()).toEqual([...usedPayees].toSorted());
      // Money nests categories two deep, so both shapes are present.
      expect(result.categories.some((category) => category.groupName === null)).toBe(true);
      expect(result.categories.some((category) => category.groupName !== null)).toBe(true);
      expect(
        result.categories
          .filter((category) => category.groupName !== null)
          .every((category) => category.fullName === `${category.groupName}:${category.name}`),
      ).toBe(true);
    });

    it('imports split children individually and drops their parent rows', () => {
      const result = parse();
      const splitRows = result.transactions.filter((tx) => tx.fromSplit);

      expect(splitRows.length).toBeGreaterThan(0);

      // Children of one split share an account, a date and a payee. If the
      // parent row leaked through it would sit in the same group carrying the
      // group's total, which would double the split.
      const groups = new Map<string, number[]>();
      for (const tx of splitRows) {
        const key = `${tx.accountName}|${tx.date}|${tx.payeeName ?? ''}`;
        groups.set(key, [...(groups.get(key) ?? []), tx.amount]);
      }
      const multiChildGroups = [...groups.entries()].filter(([, amounts]) => amounts.length > 1);
      expect(multiChildGroups.length).toBeGreaterThan(0);

      for (const [key, amounts] of multiChildGroups) {
        const [accountName, date] = key.split('|');
        const total = Number(amounts.reduce((sum, amount) => sum + amount, 0).toFixed(2));
        const parentLike = result.transactions.filter(
          (tx) =>
            tx.accountName === accountName &&
            tx.date === date &&
            Number(tx.amount.toFixed(2)) === total &&
            !amounts.includes(tx.amount),
        );

        expect(parentLike).toEqual([]);
      }
    });

    it('never emits a row twice', () => {
      const result = parse();
      const sourceIds = [
        ...result.transactions.map((tx) => tx.sourceId),
        ...result.transfers.flatMap((t) => t.sourceIds),
      ];
      const rowIndices = [
        ...result.transactions.map((tx) => tx.rowIndex),
        ...result.transfers.flatMap((t) => t.rowIndices),
      ];

      expect(sourceIds).toHaveLength(result.transactions.length + result.transfers.length * 2);
      expect(new Set(sourceIds).size).toBe(sourceIds.length);
      expect(new Set(rowIndices).size).toBe(rowIndices.length);
    });

    it('marks reconciled rows and keeps check numbers', () => {
      const result = parse();

      expect(result.transactions.filter((tx) => tx.reconciled).length).toBeGreaterThan(0);
      expect(result.transactions.filter((tx) => tx.referenceNumber !== null).length).toBeGreaterThan(0);
      expect(result.transactions.filter((tx) => tx.note !== '').length).toBeGreaterThan(0);
    });
  });

  describe('invariants across both ledgers', () => {
    const ledgers = [
      { file: 'money2005-pwd.mny', password: '123@abc!' },
      { file: 'sunset-sample-pwd.mny', password: '123@abc!' },
    ];

    it.each(ledgers)('$file: every transfer joins two imported accounts', ({ file, password }) => {
      const result = parseFixture({ file, password });
      const accountNames = new Set(result.accounts.map((account) => account.originalName));

      expect(result.transfers.length).toBeGreaterThan(0);
      for (const transfer of result.transfers) {
        expect(accountNames.has(transfer.sourceAccountName)).toBe(true);
        expect(accountNames.has(transfer.destinationAccountName)).toBe(true);
        expect(transfer.sourceAccountName).not.toBe(transfer.destinationAccountName);
        expect(transfer.sourceAmount).toBeGreaterThan(0);
        expect(transfer.destinationAmount).toBeGreaterThan(0);
        expect(transfer.sourceIds[0]).not.toBe(transfer.sourceIds[1]);
        expect(transfer.rowIndices[0]).not.toBe(transfer.rowIndices[1]);
      }
    });

    it.each(ledgers)('$file: an out-of-wallet leg is never categorized', ({ file, password }) => {
      const result = parseFixture({ file, password });

      expect(result.transactions.filter((tx) => tx.outOfWallet).length).toBeGreaterThan(0);
      expect(result.transactions.filter((tx) => tx.outOfWallet && tx.categoryName !== null)).toEqual([]);
    });

    it.each(ledgers)('$file: the stated direction matches the sign of the amount', ({ file, password }) => {
      const result = parseFixture({ file, password });

      for (const tx of result.transactions) {
        expect(tx.type).toBe(tx.amount < 0 ? TRANSACTION_TYPES.expense : TRANSACTION_TYPES.income);
      }
    });

    it.each(ledgers)('$file: every row points at an account in the result', ({ file, password }) => {
      const result = parseFixture({ file, password });
      const accountNames = new Set(result.accounts.map((account) => account.originalName));

      expect(result.transactions.filter((tx) => !accountNames.has(tx.accountName))).toEqual([]);
      expect(result.accounts.every((account) => account.transactionCount > 0)).toBe(true);
    });

    it.each(ledgers)('$file: the date range spans every row', ({ file, password }) => {
      const result = parseFixture({ file, password });
      const { from, to } = result.dateRange!;

      for (const date of [...result.transactions.map((tx) => tx.date), ...result.transfers.map((t) => t.date)]) {
        expect(date >= from).toBe(true);
        expect(date <= to).toBe(true);
      }
    });
  });

  describe('unsupported account types', () => {
    it.each(MS_MONEY_FIXTURES)('$file never surfaces an investment or loan account', ({ file, password }) => {
      const result = parseFixture({ file, password });

      expect(
        result.accounts.filter(
          (account) =>
            account.accountType === MsMoneyAccountType.investment || account.accountType === MsMoneyAccountType.loan,
        ),
      ).toEqual([]);
    });

    it('keeps the cash side of an investment account, which is an ordinary bank account', () => {
      const result = parseFixture({ file: 'sunset-sample-pwd.mny', password: '123@abc!' });
      const cashSide = result.accounts.find((account) => account.originalName === 'Woodgrove Investments (Cash)');

      expect(cashSide?.accountType).toBe(MsMoneyAccountType.banking);
    });
  });

  describe('rejections', () => {
    it('throws for a wrong password', () => {
      expect(() => parseFixture({ file: 'money2005-pwd.mny', password: 'wrong' })).toThrow(ValidationError);
      expect(() => parseFixture({ file: 'money2005-pwd.mny', password: 'wrong' })).toThrow(
        'Incorrect password for this Microsoft Money file.',
      );
    });

    it('throws when a protected file arrives without a password', () => {
      expect(() => parseFixture({ file: 'money2005-pwd.mny' })).toThrow(ValidationError);
      expect(() => parseFixture({ file: 'money2005-pwd.mny' })).toThrow(
        'This Microsoft Money file is password-protected. Enter its password to continue.',
      );
    });

    it('throws for bytes that are not a Money database', () => {
      const buffer = Buffer.alloc(4096 * 4, 0x07);

      expect(() => parseMsMoneyFile({ buffer })).toThrow(ValidationError);
      expect(() => parseMsMoneyFile({ buffer })).toThrow('This file is not a Microsoft Money database.');
    });

    it('throws a readable error when the decrypted database cannot be opened', () => {
      // money2002 has no password, so a supplied one is hashed into the key and
      // produces garbage pages instead of failing the check-byte comparison.
      expect(() => parseFixture({ file: 'money2002.mny', password: 'unnecessary' })).toThrow(ValidationError);
      expect(() => parseFixture({ file: 'money2002.mny', password: 'unnecessary' })).toThrow(
        'This Microsoft Money file could not be read',
      );
    });
  });
});
