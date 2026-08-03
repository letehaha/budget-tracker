import type { MsMoneyImportError, MsMoneyImportSummary } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import { deriveImportOutcome } from './import-outcome';

const rowError = (): MsMoneyImportError => ({ rowIndex: 3, error: 'Row could not be created' });

const balanceDesyncError = (): MsMoneyImportError => ({
  rowIndex: null,
  error: 'Balance could not be restored',
  code: 'account-balance-desync',
});

const aSummary = (overrides: Partial<MsMoneyImportSummary> = {}): MsMoneyImportSummary => ({
  accountsCreated: 0,
  accountsLinked: 1,
  accountsSkipped: 0,
  categoriesCreated: 0,
  payeesCreated: 0,
  transactionsImported: 0,
  transfersImported: 0,
  outOfWalletImported: 0,
  duplicatesSkipped: 0,
  errors: [],
  ...overrides,
});

describe('deriveImportOutcome', () => {
  it('is a success when rows landed and nothing failed', () => {
    expect(deriveImportOutcome({ summary: aSummary({ transactionsImported: 12 }) })).toBe('success');
  });

  it('counts transfers, out-of-wallet legs and voided rows as imported', () => {
    expect(deriveImportOutcome({ summary: aSummary({ transfersImported: 1 }) })).toBe('success');
    expect(deriveImportOutcome({ summary: aSummary({ outOfWalletImported: 1 }) })).toBe('success');
    expect(deriveImportOutcome({ summary: aSummary({ voidedImported: 1 }) })).toBe('success');
  });

  it('is partial when rows landed alongside errors', () => {
    expect(deriveImportOutcome({ summary: aSummary({ transactionsImported: 5, errors: [rowError()] }) })).toBe(
      'partial',
    );
  });

  it('is partial when the only failure is a balance desync', () => {
    expect(
      deriveImportOutcome({
        summary: aSummary({ transactionsImported: 5, errors: [balanceDesyncError()] }),
      }),
    ).toBe('partial');
  });

  it('is empty when every row was skipped and nothing failed', () => {
    // Regression guard: an import whose rows were all detected duplicates used to
    // render the "nothing could be created, see the errors" banner over an empty
    // error list.
    expect(deriveImportOutcome({ summary: aSummary({ duplicatesSkipped: 40 }) })).toBe('empty');
  });

  it('is empty for a file that held no importable rows at all', () => {
    expect(deriveImportOutcome({ summary: aSummary() })).toBe('empty');
  });

  it('is a failure only when nothing landed and something failed', () => {
    expect(deriveImportOutcome({ summary: aSummary({ errors: [rowError(), balanceDesyncError()] }) })).toBe('failure');
  });
});
