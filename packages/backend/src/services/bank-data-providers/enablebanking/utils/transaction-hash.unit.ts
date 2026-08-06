import { describe, expect, it } from '@jest/globals';
import crypto from 'crypto';

import { CreditDebitIndicator, type EnableBankingTransaction, TransactionStatus } from '../types';
import { generateTransactionHash, getTransactionDateString } from './transaction-hash';

const ACCOUNT_EXTERNAL_ID = 'identification-hash-1';

function rawTx(overrides: Partial<EnableBankingTransaction> = {}): EnableBankingTransaction {
  return {
    transaction_amount: { amount: '12.34', currency: 'EUR' },
    credit_debit_indicator: CreditDebitIndicator.DBIT,
    status: TransactionStatus.BOOK,
    transaction_date: '2026-05-01',
    ...overrides,
  };
}

function sha256(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function hash(tx: EnableBankingTransaction, accountExternalId = ACCOUNT_EXTERNAL_ID): string {
  return generateTransactionHash({ tx, accountExternalId });
}

describe('generateTransactionHash – entry_reference present', () => {
  it('hashes the account id plus the entry reference and nothing else', () => {
    const result = hash(rawTx({ entry_reference: 'ref-1' }));

    expect(result).toBe(sha256({ account: ACCOUNT_EXTERNAL_ID, entry_ref: 'ref-1' }));
  });

  it('stays stable when every other field changes', () => {
    const before = hash(rawTx({ entry_reference: 'ref-1' }));
    const after = hash(
      rawTx({
        entry_reference: 'ref-1',
        transaction_amount: { amount: '999.99', currency: 'USD' },
        credit_debit_indicator: CreditDebitIndicator.CRDT,
        transaction_date: '2026-06-30',
        creditor_account: { iban: 'DE89370400440532013000' },
      }),
    );

    expect(after).toBe(before);
  });

  it('differs per account for the same entry reference', () => {
    const first = hash(rawTx({ entry_reference: 'ref-1' }), 'account-a');
    const second = hash(rawTx({ entry_reference: 'ref-1' }), 'account-b');

    expect(first).not.toBe(second);
  });
});

describe('generateTransactionHash – fallback', () => {
  it('hashes account id, amount, currency, indicator, the priority date and both IBANs', () => {
    const tx = rawTx({
      debtor_account: { iban: 'DE89370400440532013000' },
      creditor_account: { iban: 'FR7630006000011234567890189' },
    });

    expect(hash(tx)).toBe(
      sha256({
        account_external_id: ACCOUNT_EXTERNAL_ID,
        amount: '12.34',
        currency: 'EUR',
        credit_debit_indicator: CreditDebitIndicator.DBIT,
        date: '2026-05-01',
        debtor_account: 'DE89370400440532013000',
        creditor_account: 'FR7630006000011234567890189',
      }),
    );
  });

  it('ignores remittance text, which banks rewrite between the pending and booked copies', () => {
    const before = hash(rawTx({ remittance_information: ['CARD PURCHASE'] }));
    const after = hash(rawTx({ remittance_information: ['ACME STORE 123'] }));

    expect(after).toBe(before);
  });

  it('stays stable when a lower-priority date is added later', () => {
    const before = hash(rawTx({ transaction_date: '2026-05-01' }));
    const after = hash(rawTx({ transaction_date: '2026-05-01', value_date: '2026-05-02', booking_date: '2026-05-03' }));

    expect(after).toBe(before);
  });

  it('changes when the priority date itself changes', () => {
    const before = hash(rawTx({ transaction_date: undefined, value_date: '2026-05-02' }));
    const after = hash(rawTx({ transaction_date: undefined, value_date: '2026-05-03' }));

    expect(after).not.toBe(before);
  });

  it('changes when the counterparty IBAN changes', () => {
    const before = hash(rawTx({ creditor_account: { iban: 'FR7630006000011234567890189' } }));
    const after = hash(rawTx({ creditor_account: { iban: 'DE89370400440532013000' } }));

    expect(after).not.toBe(before);
  });
});

describe('getTransactionDateString', () => {
  it('prefers transaction_date over value_date and booking_date', () => {
    const result = getTransactionDateString({
      tx: rawTx({ transaction_date: '2026-05-01', value_date: '2026-05-02', booking_date: '2026-05-03' }),
    });

    expect(result).toBe('2026-05-01');
  });

  it('falls back to value_date when transaction_date is absent', () => {
    const result = getTransactionDateString({
      tx: rawTx({ transaction_date: undefined, value_date: '2026-05-02', booking_date: '2026-05-03' }),
    });

    expect(result).toBe('2026-05-02');
  });

  it('falls back to booking_date when the two higher-priority dates are absent', () => {
    const result = getTransactionDateString({
      tx: rawTx({ transaction_date: undefined, value_date: undefined, booking_date: '2026-05-03' }),
    });

    expect(result).toBe('2026-05-03');
  });

  it('skips empty strings', () => {
    const result = getTransactionDateString({ tx: rawTx({ transaction_date: '', value_date: '2026-05-02' }) });

    expect(result).toBe('2026-05-02');
  });

  it('returns null when the payload carries no date at all', () => {
    const result = getTransactionDateString({ tx: rawTx({ transaction_date: undefined }) });

    expect(result).toBeNull();
  });
});
