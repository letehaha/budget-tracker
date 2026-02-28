import { faker } from '@faker-js/faker';
import type { Currency, HistoryItem, WalletBalance } from '@services/bank-data-providers/walutomat/api-client';
import { subDays } from 'date-fns';

export const getMockedWalutomatBalances = (): WalletBalance[] => [
  {
    currency: 'EUR',
    balanceTotal: '1500.00',
    balanceAvailable: '1450.50',
    balanceReserved: '49.50',
  },
  {
    currency: 'PLN',
    balanceTotal: '5200.00',
    balanceAvailable: '5200.00',
    balanceReserved: '0.00',
  },
  {
    currency: 'USD',
    balanceTotal: '300.00',
    balanceAvailable: '300.00',
    balanceReserved: '0.00',
  },
];

export const getMockedWalutomatHistory = ({
  amount = 5,
  currency = 'EUR',
}: {
  amount?: number;
  currency?: string;
} = {}): HistoryItem[] => {
  const now = new Date();

  return Array.from({ length: amount }, (_, index) => {
    const operationAmount = faker.number.float({ min: 10, max: 1000, fractionDigits: 2 });
    // Alternate between income and expense
    const signedAmount = index % 3 === 0 ? operationAmount : -operationAmount;
    const isExpense = signedAmount < 0;

    const operationType = isExpense ? 'PAYOUT' : 'PAYIN';
    const operationDetailedType = isExpense ? 'PAYOUT' : 'PAYIN';

    return {
      historyItemId: 10000 + index,
      transactionId: faker.string.uuid(),
      ts: subDays(now, index).toISOString(),
      operationAmount: signedAmount.toFixed(2),
      balanceAfter: faker.number.float({ min: 100, max: 5000, fractionDigits: 2 }).toFixed(2),
      currency: currency as Currency,
      operationType,
      operationDetailedType,
      operationDetails: [
        {
          key: 'title',
          value: isExpense ? `Transfer to ${faker.person.fullName()}` : `Deposit from ${faker.company.name()}`,
        },
      ],
    };
  });
};

/**
 * Creates a pair of FX trade history items that share the same transactionId.
 * Each side appears in a different currency's history.
 * The orderId/executionId format matches real Walutomat data.
 */
export const getMockedWalutomatFxPair = ({
  orderId = 'order-abc-123',
  executionId = 'exec-def-456',
  eurAmount = '500.00',
  usdAmount = '525.00',
}: {
  orderId?: string;
  executionId?: string;
  eurAmount?: string;
  usdAmount?: string;
} = {}): { eurSide: HistoryItem; usdSide: HistoryItem } => {
  const now = new Date();
  const transactionId = `${orderId}/${executionId}`;
  const ts = subDays(now, 1).toISOString();

  const sharedDetails = [
    { key: 'orderId', value: orderId },
    { key: 'currencyPair', value: 'EUR_USD' },
    { key: 'buySell', value: 'SELL' },
    { key: 'orderVolume', value: `${usdAmount} USD` },
  ];

  return {
    // EUR side: income (buying EUR)
    eurSide: {
      historyItemId: 30001,
      transactionId,
      ts,
      operationAmount: eurAmount,
      balanceAfter: '2000.00',
      currency: 'EUR',
      operationType: 'MARKET_FX',
      operationDetailedType: 'MARKET_FX',
      operationDetails: sharedDetails,
    },
    // USD side: expense (selling USD)
    usdSide: {
      historyItemId: 30002,
      transactionId,
      ts,
      operationAmount: `-${usdAmount}`,
      balanceAfter: '1000.00',
      currency: 'USD',
      operationType: 'MARKET_FX',
      operationDetailedType: 'MARKET_FX',
      operationDetails: sharedDetails,
    },
  };
};
