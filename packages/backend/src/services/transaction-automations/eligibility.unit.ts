import { ACCOUNT_TYPES, TRANSACTION_TRANSFER_NATURE } from '@bt/shared/types';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import { Op, literal } from 'sequelize';

import { buildEligibilityWhere, isAutomationEligible } from './eligibility';

const eligible = {
  accountType: ACCOUNT_TYPES.monobank,
  externalData: null,
  transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
  isPlanned: false,
};

describe('isAutomationEligible', () => {
  it.each([ACCOUNT_TYPES.monobank, ACCOUNT_TYPES.enableBanking, ACCOUNT_TYPES.lunchflow, ACCOUNT_TYPES.simplefin])(
    'accepts %s regardless of externalData',
    (accountType) => {
      expect(isAutomationEligible({ ...eligible, accountType, externalData: null })).toBe(true);
    },
  );

  it.each([
    ['an object', { batchId: 'b-1' }],
    ['an empty object', {}],
    ['null', null],
    ['undefined', undefined],
  ])('treats an importDetails key of %s as present', (_name, importDetails) => {
    expect(
      isAutomationEligible({ ...eligible, accountType: ACCOUNT_TYPES.system, externalData: { importDetails } }),
    ).toBe(true);
  });

  it('accepts a synced and an imported row', () => {
    expect(isAutomationEligible(eligible)).toBe(true);
    expect(
      isAutomationEligible({
        ...eligible,
        accountType: ACCOUNT_TYPES.system,
        externalData: { importDetails: { batchId: 'b-1' } },
      }),
    ).toBe(true);
  });

  it('accepts a manual system row when applyAutomations is set', () => {
    expect(
      isAutomationEligible({
        ...eligible,
        accountType: ACCOUNT_TYPES.system,
        externalData: null,
        applyAutomations: true,
      }),
    ).toBe(true);
  });

  it.each([
    ['a manual system row', { accountType: ACCOUNT_TYPES.system, externalData: null }],
    ['a planned row', { isPlanned: true }],
    ['a planned row even with applyAutomations', { isPlanned: true, applyAutomations: true }],
    ['a transfer leg', { transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer }],
    ['a wallet-out transfer', { transferNature: TRANSACTION_TRANSFER_NATURE.transfer_out_wallet }],
    [
      'a balance adjustment',
      { accountType: ACCOUNT_TYPES.system, externalData: { balanceAdjustment: true } as Record<string, unknown> },
    ],
  ])('rejects %s', (_name, overrides) => {
    expect(isAutomationEligible({ ...eligible, ...overrides })).toBe(false);
  });
});

describe('buildEligibilityWhere', () => {
  it('carries the trigger axis of its predicate twin and drops split parents', () => {
    const bankAccountIds = [generateRandomRecordId(), generateRandomRecordId()];
    const [eligibility, noSplits] = buildEligibilityWhere({ bankAccountIds })[Op.and];
    const [accountClause, importClause] = eligibility?.[Op.or] ?? [];

    expect(accountClause).toEqual({ accountId: { [Op.in]: bankAccountIds } });
    expect((importClause as ReturnType<typeof literal>).val).toContain(`"externalData"->'importDetails' IS NOT NULL`);
    expect((noSplits as ReturnType<typeof literal>).val).toContain('NOT EXISTS (SELECT 1 FROM "TransactionSplits"');
  });
});
