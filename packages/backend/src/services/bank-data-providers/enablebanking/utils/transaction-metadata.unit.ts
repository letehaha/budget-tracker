import { CATEGORIZATION_SOURCE, PAYMENT_TYPES, TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';

import { CreditDebitIndicator, type EnableBankingTransaction, TransactionStatus } from '../types';
import {
  cleanMerchantName,
  deriveNoteFromRaw,
  getCounterpartyIban,
  getEntryReference,
  getRawTransaction,
  getRawTransactionStatus,
  hasSettledStatus,
  isBookedCanonical,
  isNonLedgerStatus,
  isPendingOrphan,
  isPreBookingStatus,
  isRevokedStatus,
  syncGeneratedNote,
  toEditMergeSide,
  withoutUndefinedValues,
} from './transaction-metadata';

const IBAN = 'FR7630006000011234567890189';

function rawTx(overrides: Partial<EnableBankingTransaction> = {}): EnableBankingTransaction {
  return {
    transaction_amount: { amount: '12.34', currency: 'EUR' },
    credit_debit_indicator: CreditDebitIndicator.DBIT,
    status: TransactionStatus.BOOK,
    ...overrides,
  };
}

const ALL_STATUSES = Object.values(TransactionStatus);

/** Every status that is not accounted money: not yet, or never will be. */
const UNSETTLED_STATUSES = ALL_STATUSES.filter(
  (status) => status !== TransactionStatus.BOOK && status !== TransactionStatus.OTHR,
);

/** Asserts a status predicate over the full documented set, plus the no-payload case. */
function expectAccepts({
  predicate,
  accepted,
}: {
  predicate: (args: { status: TransactionStatus | null }) => boolean;
  accepted: TransactionStatus[];
}) {
  for (const status of ALL_STATUSES) {
    expect({ status, matched: predicate({ status }) }).toEqual({ status, matched: accepted.includes(status) });
  }
  expect(predicate({ status: null })).toBe(false);
}

describe('status predicates', () => {
  it('isPreBookingStatus accepts only the two statuses that later book', () => {
    expectAccepts({ predicate: isPreBookingStatus, accepted: [TransactionStatus.PDNG, TransactionStatus.HOLD] });
  });

  it('isRevokedStatus accepts only the two the ASPSP abandoned', () => {
    expectAccepts({ predicate: isRevokedStatus, accepted: [TransactionStatus.CNCL, TransactionStatus.RJCT] });
  });

  it('isNonLedgerStatus also covers the not-yet-executed one', () => {
    expectAccepts({
      predicate: isNonLedgerStatus,
      accepted: [TransactionStatus.CNCL, TransactionStatus.RJCT, TransactionStatus.SCHD],
    });
  });
});

describe('deriveNoteFromRaw', () => {
  it('joins the remittance lines with a space', () => {
    const result = deriveNoteFromRaw({ rawTransaction: rawTx({ remittance_information: ['ACME', 'STORE 123'] }) });

    expect(result).toBe('ACME STORE 123');
  });

  it('falls back to "Transaction" when there is no remittance information', () => {
    expect(deriveNoteFromRaw({ rawTransaction: rawTx() })).toBe('Transaction');
  });

  it('falls back to "Transaction" when the remittance lines are empty', () => {
    expect(deriveNoteFromRaw({ rawTransaction: rawTx({ remittance_information: [] }) })).toBe('Transaction');
    expect(deriveNoteFromRaw({ rawTransaction: rawTx({ remittance_information: [''] }) })).toBe('Transaction');
  });
});

describe('cleanMerchantName', () => {
  it('trims a real merchant name', () => {
    expect(cleanMerchantName({ merchantName: '  ACME STORE  ' })).toBe('ACME STORE');
  });

  it('drops the "Unknown" sentinel', () => {
    expect(cleanMerchantName({ merchantName: 'Unknown' })).toBe('');
  });

  it('returns an empty string for a missing or empty name', () => {
    expect(cleanMerchantName({ merchantName: undefined })).toBe('');
    expect(cleanMerchantName({ merchantName: '' })).toBe('');
  });
});

describe('withoutUndefinedValues', () => {
  it('drops undefined values and keeps every other falsy one', () => {
    const result = withoutUndefinedValues({
      source: { a: undefined, b: null, c: 0, d: '', e: false } as Record<string, unknown>,
    });

    expect(result).toEqual({ b: null, c: 0, d: '', e: false });
  });

  it('leaves the source object untouched', () => {
    const source: Record<string, unknown> = { a: undefined, b: 1 };

    withoutUndefinedValues({ source });

    expect(Object.keys(source)).toEqual(['a', 'b']);
  });
});

describe('getRawTransaction / getRawTransactionStatus', () => {
  it('reads the stored raw payload and its status', () => {
    const rawTransaction = rawTx({ status: TransactionStatus.PDNG });

    expect(getRawTransaction({ externalData: { rawTransaction } })).toBe(rawTransaction);
    expect(getRawTransactionStatus({ externalData: { rawTransaction } })).toBe(TransactionStatus.PDNG);
  });

  it('returns null for rows that were not synced from Enable Banking', () => {
    expect(getRawTransaction({ externalData: {} })).toBeNull();
    expect(getRawTransaction({ externalData: null })).toBeNull();
    expect(getRawTransaction({ externalData: undefined })).toBeNull();
    expect(getRawTransactionStatus({ externalData: null })).toBeNull();
  });

  it('returns null when the stored payload carries no status', () => {
    expect(getRawTransactionStatus({ externalData: { rawTransaction: {} } })).toBeNull();
  });
});

describe('getEntryReference', () => {
  it('returns the stored reference', () => {
    expect(getEntryReference({ tx: { externalData: { entryReference: 'ref-1' } } })).toBe('ref-1');
  });

  it('returns null when the reference is absent or null', () => {
    expect(getEntryReference({ tx: { externalData: {} } })).toBeNull();
    expect(getEntryReference({ tx: { externalData: { entryReference: null } } })).toBeNull();
    expect(getEntryReference({ tx: { externalData: null } })).toBeNull();
  });

  it('stringifies a non-string reference so it stays "present", like the SQL predicate', () => {
    expect(getEntryReference({ tx: { externalData: { entryReference: 42 } } })).toBe('42');
  });
});

describe('getCounterpartyIban', () => {
  it('reads creditorAccount for expenses and debtorAccount for income', () => {
    const externalData = { creditorAccount: IBAN, debtorAccount: 'DE89370400440532013000' };

    expect(getCounterpartyIban({ tx: { externalData, transactionType: TRANSACTION_TYPES.expense } })).toBe(IBAN);
    expect(getCounterpartyIban({ tx: { externalData, transactionType: TRANSACTION_TYPES.income } })).toBe(
      'DE89370400440532013000',
    );
  });

  it('returns null for a missing, empty or non-string IBAN', () => {
    const expense = TRANSACTION_TYPES.expense;

    expect(getCounterpartyIban({ tx: { externalData: {}, transactionType: expense } })).toBeNull();
    expect(getCounterpartyIban({ tx: { externalData: { creditorAccount: '' }, transactionType: expense } })).toBeNull();
    expect(getCounterpartyIban({ tx: { externalData: { creditorAccount: 42 }, transactionType: expense } })).toBeNull();
    expect(getCounterpartyIban({ tx: { externalData: null, transactionType: expense } })).toBeNull();
  });
});

describe('isPendingOrphan', () => {
  it('accepts a pending or held row that carries no entry reference', () => {
    for (const status of [TransactionStatus.PDNG, TransactionStatus.HOLD]) {
      expect(isPendingOrphan({ tx: { externalData: { rawTransaction: rawTx({ status }) } } })).toBe(true);
    }
  });

  it('rejects a pending row that already carries an entry reference', () => {
    const externalData = { rawTransaction: rawTx({ status: TransactionStatus.PDNG }), entryReference: 'ref-1' };

    expect(isPendingOrphan({ tx: { externalData } })).toBe(false);
  });

  it('rejects booked, cancelled and rows with no stored payload', () => {
    expect(isPendingOrphan({ tx: { externalData: { rawTransaction: rawTx() } } })).toBe(false);
    expect(
      isPendingOrphan({ tx: { externalData: { rawTransaction: rawTx({ status: TransactionStatus.CNCL }) } } }),
    ).toBe(false);
    expect(isPendingOrphan({ tx: { externalData: {} } })).toBe(false);
    expect(isPendingOrphan({ tx: { externalData: null } })).toBe(false);
  });
});

describe('hasSettledStatus', () => {
  it('accepts booked, other, and rows with no stored payload', () => {
    expect(hasSettledStatus({ tx: { externalData: { rawTransaction: rawTx() } } })).toBe(true);
    expect(
      hasSettledStatus({ tx: { externalData: { rawTransaction: rawTx({ status: TransactionStatus.OTHR }) } } }),
    ).toBe(true);
    expect(hasSettledStatus({ tx: { externalData: {} } })).toBe(true);
    expect(hasSettledStatus({ tx: { externalData: null } })).toBe(true);
  });

  it('rejects every status that is not accounted money', () => {
    for (const status of UNSETTLED_STATUSES) {
      expect({
        status,
        settled: hasSettledStatus({ tx: { externalData: { rawTransaction: rawTx({ status }) } } }),
      }).toEqual({ status, settled: false });
    }
  });
});

describe('isBookedCanonical', () => {
  it('accepts a booked row', () => {
    expect(isBookedCanonical({ tx: { externalData: { rawTransaction: rawTx() } } })).toBe(true);
  });

  it('never accepts an unsettled row, whatever else it carries', () => {
    for (const status of UNSETTLED_STATUSES) {
      const externalData = { rawTransaction: rawTx({ status }), entryReference: 'ref-1' };

      expect({ status, canonical: isBookedCanonical({ tx: { externalData } }) }).toEqual({ status, canonical: false });
    }
  });

  it('accepts a non-pending row that carries an entry reference', () => {
    const otherStatus = { rawTransaction: rawTx({ status: TransactionStatus.OTHR }), entryReference: 'ref-1' };

    expect(isBookedCanonical({ tx: { externalData: otherStatus } })).toBe(true);
    expect(isBookedCanonical({ tx: { externalData: { entryReference: 'ref-1' } } })).toBe(true);
  });

  it('rejects a row with neither a booked status nor an entry reference', () => {
    expect(
      isBookedCanonical({ tx: { externalData: { rawTransaction: rawTx({ status: TransactionStatus.OTHR }) } } }),
    ).toBe(false);
    expect(isBookedCanonical({ tx: { externalData: null } })).toBe(false);
  });
});

describe('syncGeneratedNote', () => {
  it('derives the note from the stored raw payload', () => {
    const externalData = { rawTransaction: rawTx({ remittance_information: ['ACME STORE'] }) };

    expect(syncGeneratedNote({ tx: { externalData } })).toBe('ACME STORE');
  });

  it('returns null for a row sync never wrote', () => {
    expect(syncGeneratedNote({ tx: { externalData: {} } })).toBeNull();
    expect(syncGeneratedNote({ tx: { externalData: null } })).toBeNull();
  });
});

describe('toEditMergeSide', () => {
  it('keeps only the scalars the merge policy reads', () => {
    const categorizationMeta = { source: CATEGORIZATION_SOURCE.manual, categorizedAt: '2026-01-01T00:00:00.000Z' };

    const result = toEditMergeSide({
      tx: {
        note: 'Birthday gift',
        categoryId: 'category-1',
        paymentType: PAYMENT_TYPES.creditCard,
        payeeId: 'payee-1',
        payeeLocked: true,
        categorizationMeta,
      },
    });

    expect(result).toEqual({
      note: 'Birthday gift',
      categoryId: 'category-1',
      paymentType: PAYMENT_TYPES.creditCard,
      payeeId: 'payee-1',
      payeeLocked: true,
      categorizationMeta,
    });
  });

  it('normalizes a missing note to null', () => {
    const result = toEditMergeSide({
      tx: {
        note: null,
        categoryId: 'category-1',
        paymentType: PAYMENT_TYPES.bankTransfer,
        payeeId: null,
        payeeLocked: false,
        categorizationMeta: null,
      },
    });

    expect(result.note).toBeNull();
  });
});
