import { ACCOUNT_STATUSES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import type { AccountApiResponse } from '@root/serializers/accounts.serializer';
import type { TransactionApiResponse } from '@root/serializers/transactions.serializer';

import { slimAccountsForMcp, slimTransactionsForMcp } from './serializers';

const fullAccount: AccountApiResponse = {
  id: 'acc-1',
  name: 'Checking',
  initialBalance: 100,
  refInitialBalance: 100,
  currentBalance: 250.5,
  refCurrentBalance: 230.25,
  creditLimit: 0,
  refCreditLimit: 0,
  type: 'system',
  accountCategory: 'general',
  currencyCode: 'USD',
  userId: 42,
  externalId: 'ext-abc',
  externalData: { iban: 'SECRET', owner: 'PII' },
  status: ACCOUNT_STATUSES.active,
  excludeFromStats: false,
  bankDataProviderConnectionId: 'conn-1',
  bankProviderType: null,
  needsRelink: true,
  share: { isOwner: true } as AccountApiResponse['share'],
};

const fullTransaction: TransactionApiResponse = {
  id: 'tx-1',
  amount: 12.34,
  refAmount: 11.5,
  commissionRate: 0,
  refCommissionRate: 0,
  cashbackAmount: 0,
  note: 'Coffee',
  time: new Date('2026-01-01T10:00:00.000Z'),
  userId: 42,
  transactionType: TRANSACTION_TYPES.expense,
  paymentType: 'creditCard',
  accountId: 'acc-1',
  categoryId: 'cat-1',
  currencyCode: 'USD',
  accountType: 'system',
  refCurrencyCode: 'EUR',
  transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
  transferId: null,
  originalId: 'orig-1',
  externalData: { raw: 'BANK BLOB' },
  refundLinked: false,
  createdAt: new Date('2026-01-01T10:00:00.000Z'),
  updatedAt: new Date('2026-01-02T10:00:00.000Z'),
  tags: [{ id: 'tag-1', name: 'food', color: '#fff', icon: 'cup' }],
  splits: [{ id: 'split-1', categoryId: 'cat-2', amount: 12.34, refAmount: 11.5, note: 'half' }],
  transactionGroups: [{ id: 'grp-1', name: 'Trip' }],
};

describe('MCP serializers', () => {
  describe('slimAccountsForMcp', () => {
    it('keeps only AI-relevant account fields', () => {
      const slim = slimAccountsForMcp([fullAccount])[0]!;
      expect(Object.keys(slim).toSorted()).toEqual(
        [
          'accountCategory',
          'creditLimit',
          'currencyCode',
          'currentBalance',
          'excludeFromStats',
          'id',
          'name',
          'refCreditLimit',
          'refCurrentBalance',
          'status',
          'type',
        ].toSorted(),
      );
    });

    it('drops bank-sync metadata, ACL and audit fields', () => {
      const slim = (slimAccountsForMcp([fullAccount]) as unknown as Record<string, unknown>[])[0]!;
      for (const dropped of [
        'userId',
        'externalId',
        'externalData',
        'bankDataProviderConnectionId',
        'bankProviderType',
        'needsRelink',
        'share',
        'initialBalance',
        'refInitialBalance',
      ]) {
        expect(slim).not.toHaveProperty(dropped);
      }
    });
  });

  describe('slimTransactionsForMcp', () => {
    it('keeps only AI-relevant transaction fields', () => {
      const slim = slimTransactionsForMcp([fullTransaction])[0]!;
      expect(Object.keys(slim).toSorted()).toEqual(
        [
          'accountId',
          'amount',
          'categoryId',
          'currencyCode',
          'id',
          'note',
          'refAmount',
          'splits',
          'tags',
          'time',
          'transactionGroups',
          'transactionType',
          'transferNature',
        ].toSorted(),
      );
    });

    it('drops fee, internal, audit and bank-blob fields', () => {
      const slim = (slimTransactionsForMcp([fullTransaction]) as unknown as Record<string, unknown>[])[0]!;
      for (const dropped of [
        'userId',
        'paymentType',
        'accountType',
        'refCurrencyCode',
        'transferId',
        'originalId',
        'externalData',
        'commissionRate',
        'refCommissionRate',
        'cashbackAmount',
        'refundLinked',
        'createdAt',
        'updatedAt',
      ]) {
        expect(slim).not.toHaveProperty(dropped);
      }
    });

    it('slims embedded tags to id+name and splits to category/amount/note', () => {
      const slim = slimTransactionsForMcp([fullTransaction])[0]!;
      expect(slim.tags).toEqual([{ id: 'tag-1', name: 'food' }]);
      expect(slim.splits).toEqual([{ categoryId: 'cat-2', amount: 12.34, note: 'half' }]);
    });

    it('omits embedded collections when absent', () => {
      const { tags, splits, transactionGroups, ...noCollections } = fullTransaction;
      void tags;
      void splits;
      void transactionGroups;
      const slim = (slimTransactionsForMcp([noCollections]) as unknown as Record<string, unknown>[])[0]!;
      expect(slim).not.toHaveProperty('tags');
      expect(slim).not.toHaveProperty('splits');
      expect(slim).not.toHaveProperty('transactionGroups');
    });
  });
});
