import { describe, expect, it } from '@jest/globals';

import { BalanceStatus, type EnableBankingBalance } from '../types';
import { pickAccountBalance } from './balances';

const balance = ({ type }: { type: BalanceStatus }) =>
  ({ balance_type: type, balance_amount: { amount: '1.00', currency: 'EUR' } }) as EnableBankingBalance;

describe('pickAccountBalance', () => {
  it.each([
    [[BalanceStatus.CLAV, BalanceStatus.ITAV, BalanceStatus.CLBD, BalanceStatus.ITBD], BalanceStatus.ITBD],
    [[BalanceStatus.CLAV, BalanceStatus.ITAV, BalanceStatus.CLBD], BalanceStatus.CLBD],
    [[BalanceStatus.CLAV, BalanceStatus.ITAV], BalanceStatus.ITAV],
    [[BalanceStatus.OPAV, BalanceStatus.CLAV], BalanceStatus.CLAV],
    [[BalanceStatus.OPAV, BalanceStatus.INFO], BalanceStatus.OPAV],
  ])('picks booked types before available ones: %j → %s', (types, expected) => {
    expect(pickAccountBalance({ balances: types.map((type) => balance({ type })) })?.balance_type).toBe(expected);
  });

  it('returns undefined when the bank reports no balances', () => {
    expect(pickAccountBalance({ balances: [] })).toBeUndefined();
  });
});
