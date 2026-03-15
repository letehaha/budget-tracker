import { ACCOUNT_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import Accounts from '@models/Accounts.model';
import Transactions from '@models/Transactions.model';
import * as helpers from '@tests/helpers';
import { getMockedWalutomatHistory } from '@tests/mocks/walutomat/data';
import { getWalutomatBalancesMock, getWalutomatHistoryMock } from '@tests/mocks/walutomat/mock-api';

import type { Currency, HistoryItem } from './api-client';

const MOCK_EXTERNAL_IBAN = 'BE67967310247287';

/**
 * Create a mock account that simulates an Enable Banking account with an IBAN.
 * Uses the helpers API to create a real account, then updates it directly
 * to add the accountType and externalData that Enable Banking would set.
 */
async function createAccountWithIban({
  currencyCode,
  iban,
}: {
  currencyCode: string;
  iban: string;
}): Promise<Accounts> {
  const account = await helpers.createAccount({
    payload: {
      ...helpers.buildAccountPayload(),
      currencyCode,
      name: `Test Bank (${iban})`,
    },
    raw: true,
  });

  await Accounts.update({ externalData: { iban } }, { where: { id: account.id } });

  return (await Accounts.findByPk(account.id))!;
}

/**
 * Create a mock transaction in a specific account (simulates a bank transaction).
 */
async function createBankTransaction({
  accountId,
  amount,
  transactionType,
  time,
}: {
  accountId: number;
  amount: number;
  transactionType: TRANSACTION_TYPES;
  time: Date;
}): Promise<Transactions> {
  const [baseTx] = await helpers.createTransaction({
    payload: {
      ...helpers.buildTransactionPayload({ accountId }),
      amount,
      transactionType,
      time: time.toISOString(),
    },
    raw: true,
  });

  return (await Transactions.findByPk(baseTx.id))!;
}

/**
 * Build a Walutomat PAYOUT history item that sends money to a specific IBAN.
 */
function buildPayoutHistoryItem({
  amount,
  currency,
  destinationIban,
  ts,
}: {
  amount: string;
  currency: string;
  destinationIban: string;
  ts: string;
}): HistoryItem {
  return {
    historyItemId: 90001,
    transactionId: 'payout-tx-001',
    ts,
    operationAmount: `-${amount}`,
    balanceAfter: '0.00',
    currency: currency as Currency,
    operationType: 'PAYOUT',
    operationDetailedType: 'PAYOUT',
    operationDetails: [
      { key: 'destinationAccount', value: destinationIban },
      { key: 'ownerName', value: 'Test User' },
      { key: 'feeAmount', value: `0.00 ${currency}` },
    ],
  };
}

/**
 * Build a Walutomat PAYIN history item that receives money from a specific IBAN.
 */
function buildPayinHistoryItem({
  amount,
  currency,
  sourceIban,
  ts,
}: {
  amount: string;
  currency: string;
  sourceIban: string;
  ts: string;
}): HistoryItem {
  return {
    historyItemId: 90002,
    transactionId: 'payin-tx-001',
    ts,
    operationAmount: amount,
    balanceAfter: amount,
    currency: currency as Currency,
    operationType: 'PAYIN',
    operationDetailedType: 'PAYIN',
    operationDetails: [
      { key: 'sourceAccount', value: sourceIban },
      { key: 'senderName', value: 'Test Sender' },
      { key: 'transferTitle', value: 'Test deposit' },
    ],
  };
}

describe('Walutomat Cross-Provider PAYIN/PAYOUT Linking', () => {
  it('should auto-link PAYOUT to matching income in another account (by IBAN)', async () => {
    const txTime = new Date('2026-02-27T12:00:00Z');
    const amount = 1000;

    // Step 1: Create an external bank account with the destination IBAN
    const bankAccount = await createAccountWithIban({
      currencyCode: 'EUR',
      iban: MOCK_EXTERNAL_IBAN,
    });

    // Step 2: Create a matching income transaction in the bank account
    // (This is the money arriving at the bank from Walutomat)
    const bankTx = await createBankTransaction({
      accountId: bankAccount.id,
      amount,
      transactionType: TRANSACTION_TYPES.income,
      time: new Date('2026-02-28T10:00:00Z'), // Arrives 1 day later
    });

    // Step 3: Connect Walutomat and sync with a PAYOUT to the same IBAN
    const payoutItem = buildPayoutHistoryItem({
      amount: amount.toFixed(2),
      currency: 'EUR',
      destinationIban: MOCK_EXTERNAL_IBAN,
      ts: txTime.toISOString(),
    });

    const { connectionId } = await helpers.walutomat.pair();
    global.mswMockServer.use(getWalutomatHistoryMock({ response: [payoutItem] }), getWalutomatBalancesMock());

    await helpers.bankDataProviders.connectSelectedAccounts({
      connectionId,
      accountExternalIds: ['wallet-eur'],
      raw: true,
    });

    // Step 4: Verify the transactions are linked
    const updatedBankTx = await Transactions.findByPk(bankTx.id);
    const walutomatTx = await Transactions.findOne({
      where: { originalId: 'payout-tx-001' },
    });

    expect(updatedBankTx!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.common_transfer);
    expect(walutomatTx!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.common_transfer);
    expect(updatedBankTx!.transferId).toBeTruthy();
    expect(updatedBankTx!.transferId).toBe(walutomatTx!.transferId);
  });

  it('should auto-link PAYIN to matching expense in another account (by IBAN)', async () => {
    const txTime = new Date('2026-02-27T12:00:00Z');
    const amount = 5000;

    // Create external bank account with the source IBAN
    const bankAccount = await createAccountWithIban({
      currencyCode: 'EUR',
      iban: MOCK_EXTERNAL_IBAN,
    });

    // Create matching expense in the bank account (money sent TO Walutomat)
    const bankTx = await createBankTransaction({
      accountId: bankAccount.id,
      amount,
      transactionType: TRANSACTION_TYPES.expense,
      time: new Date('2026-02-26T15:00:00Z'), // Sent 1 day before arrival
    });

    // Sync Walutomat with a PAYIN from the same IBAN
    const payinItem = buildPayinHistoryItem({
      amount: amount.toFixed(2),
      currency: 'EUR',
      sourceIban: MOCK_EXTERNAL_IBAN,
      ts: txTime.toISOString(),
    });

    const { connectionId } = await helpers.walutomat.pair();
    global.mswMockServer.use(getWalutomatHistoryMock({ response: [payinItem] }), getWalutomatBalancesMock());

    await helpers.bankDataProviders.connectSelectedAccounts({
      connectionId,
      accountExternalIds: ['wallet-eur'],
      raw: true,
    });

    // Verify linking
    const updatedBankTx = await Transactions.findByPk(bankTx.id);
    const walutomatTx = await Transactions.findOne({
      where: { originalId: 'payin-tx-001' },
    });

    expect(updatedBankTx!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.common_transfer);
    expect(walutomatTx!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.common_transfer);
    expect(updatedBankTx!.transferId).toBe(walutomatTx!.transferId);
  });

  it('should NOT link when no account matches the IBAN', async () => {
    const payoutItem = buildPayoutHistoryItem({
      amount: '500.00',
      currency: 'EUR',
      destinationIban: 'XX99UNKNOWN000000',
      ts: new Date('2026-02-27T12:00:00Z').toISOString(),
    });

    const { connectionId } = await helpers.walutomat.pair();
    global.mswMockServer.use(getWalutomatHistoryMock({ response: [payoutItem] }), getWalutomatBalancesMock());

    await helpers.bankDataProviders.connectSelectedAccounts({
      connectionId,
      accountExternalIds: ['wallet-eur'],
      raw: true,
    });

    const walutomatTx = await Transactions.findOne({
      where: { originalId: 'payout-tx-001' },
    });

    expect(walutomatTx!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.not_transfer);
    expect(walutomatTx!.transferId).toBeNull();
  });

  it('should NOT link when amount does not match', async () => {
    const bankAccount = await createAccountWithIban({
      currencyCode: 'EUR',
      iban: MOCK_EXTERNAL_IBAN,
    });

    // Bank has 999 EUR income, but Walutomat PAYOUT is 1000 EUR
    await createBankTransaction({
      accountId: bankAccount.id,
      amount: 999,
      transactionType: TRANSACTION_TYPES.income,
      time: new Date('2026-02-28T10:00:00Z'),
    });

    const payoutItem = buildPayoutHistoryItem({
      amount: '1000.00',
      currency: 'EUR',
      destinationIban: MOCK_EXTERNAL_IBAN,
      ts: new Date('2026-02-27T12:00:00Z').toISOString(),
    });

    const { connectionId } = await helpers.walutomat.pair();
    global.mswMockServer.use(getWalutomatHistoryMock({ response: [payoutItem] }), getWalutomatBalancesMock());

    await helpers.bankDataProviders.connectSelectedAccounts({
      connectionId,
      accountExternalIds: ['wallet-eur'],
      raw: true,
    });

    const walutomatTx = await Transactions.findOne({
      where: { originalId: 'payout-tx-001' },
    });

    expect(walutomatTx!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.not_transfer);
  });

  it('should NOT link when date is outside the 3-day window', async () => {
    const bankAccount = await createAccountWithIban({
      currencyCode: 'EUR',
      iban: MOCK_EXTERNAL_IBAN,
    });

    // Bank transaction is 5 days later — outside the 3-day window
    await createBankTransaction({
      accountId: bankAccount.id,
      amount: 1000,
      transactionType: TRANSACTION_TYPES.income,
      time: new Date('2026-03-04T10:00:00Z'),
    });

    const payoutItem = buildPayoutHistoryItem({
      amount: '1000.00',
      currency: 'EUR',
      destinationIban: MOCK_EXTERNAL_IBAN,
      ts: new Date('2026-02-27T12:00:00Z').toISOString(),
    });

    const { connectionId } = await helpers.walutomat.pair();
    global.mswMockServer.use(getWalutomatHistoryMock({ response: [payoutItem] }), getWalutomatBalancesMock());

    await helpers.bankDataProviders.connectSelectedAccounts({
      connectionId,
      accountExternalIds: ['wallet-eur'],
      raw: true,
    });

    const walutomatTx = await Transactions.findOne({
      where: { originalId: 'payout-tx-001' },
    });

    expect(walutomatTx!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.not_transfer);
  });

  it('should NOT link regular PAYIN/PAYOUT without IBAN in operationDetails', async () => {
    // Use default mocked history which has PAYIN/PAYOUT without sourceAccount/destinationAccount
    const regularHistory = getMockedWalutomatHistory({ amount: 2, currency: 'EUR' });

    const { connectionId } = await helpers.walutomat.pair();
    global.mswMockServer.use(getWalutomatHistoryMock({ response: regularHistory }), getWalutomatBalancesMock());

    await helpers.bankDataProviders.connectSelectedAccounts({
      connectionId,
      accountExternalIds: ['wallet-eur'],
      raw: true,
    });

    const txs = await Transactions.findAll({
      where: { accountType: ACCOUNT_TYPES.walutomat },
    });

    txs.forEach((tx) => {
      expect(tx.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.not_transfer);
    });
  });
});
