import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';

import { partitionReconcileAccounts } from './partition-reconcile-accounts';

describe('partitionReconcileAccounts', () => {
  it('splits link-existing into captured and create-new into created', () => {
    const linkedId = generateRandomRecordId();
    const createdId = generateRandomRecordId();

    const { capturedAccountIds, createdAccounts } = partitionReconcileAccounts({
      accountNameToId: new Map([
        ['Bank', linkedId],
        ['Cash', createdId],
      ]),
      accountMapping: {
        Bank: { action: 'link-existing' },
        Cash: { action: 'create-new', currentBalance: null },
      },
    });

    expect(capturedAccountIds).toEqual([linkedId]);
    expect(createdAccounts).toEqual([{ accountId: createdId, accountName: 'Cash', targetCurrentBalance: undefined }]);
  });

  it('treats a name with no mapping entry (defaultAccountId fallback) as captured, never created', () => {
    // CSV's "single existing account" flow: every row has an empty account name
    // and the mapping is empty — the rows still land on a pre-existing account
    // whose balance must be captured before any row is written.
    const fallbackId = generateRandomRecordId();

    const { capturedAccountIds, createdAccounts } = partitionReconcileAccounts({
      accountNameToId: new Map([['', fallbackId]]),
      accountMapping: {},
    });

    expect(capturedAccountIds).toEqual([fallbackId]);
    expect(createdAccounts).toHaveLength(0);
  });

  it('deduplicates captured ids when several source names resolve to one account', () => {
    const sharedId = generateRandomRecordId();

    const { capturedAccountIds } = partitionReconcileAccounts({
      accountNameToId: new Map([
        ['Checking', sharedId],
        ['Chequing', sharedId],
      ]),
      accountMapping: {
        Checking: { action: 'link-existing' },
        Chequing: { action: 'link-existing' },
      },
    });

    expect(capturedAccountIds).toEqual([sharedId]);
  });

  it('converts an entered create-new balance to a Money target and keeps null/absent as undefined', () => {
    const withTargetId = generateRandomRecordId();
    const nullTargetId = generateRandomRecordId();
    const absentTargetId = generateRandomRecordId();

    const { createdAccounts } = partitionReconcileAccounts({
      accountNameToId: new Map([
        ['Targeted', withTargetId],
        ['NullTarget', nullTargetId],
        ['AbsentTarget', absentTargetId],
      ]),
      accountMapping: {
        Targeted: { action: 'create-new', currentBalance: 1250.75 },
        NullTarget: { action: 'create-new', currentBalance: null },
        AbsentTarget: { action: 'create-new' },
      },
    });

    const byName = new Map(createdAccounts.map((c) => [c.accountName, c]));
    expect(byName.get('Targeted')?.targetCurrentBalance?.toNumber()).toBe(1250.75);
    expect(byName.get('NullTarget')?.targetCurrentBalance).toBeUndefined();
    expect(byName.get('AbsentTarget')?.targetCurrentBalance).toBeUndefined();
  });

  it('handles a zero entered balance as a real Money target, not "no target"', () => {
    const accountId = generateRandomRecordId();

    const { createdAccounts } = partitionReconcileAccounts({
      accountNameToId: new Map([['Zeroed', accountId]]),
      accountMapping: { Zeroed: { action: 'create-new', currentBalance: 0 } },
    });

    expect(createdAccounts[0]?.targetCurrentBalance?.isZero()).toBe(true);
  });
});
