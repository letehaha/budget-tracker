import { ACCESS_SOURCES, type AccountModel, SHARE_PERMISSIONS, TRANSACTIONS_WRITE_SCOPES } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';
import { ref } from 'vue';

import { useAccountAccess } from './use-account-access';

const buildAccount = (overrides: Partial<AccountModel> = {}): AccountModel =>
  ({
    id: 1,
    name: 'Wallet',
    ...overrides,
  }) as AccountModel;

const buildShare = (overrides: Partial<NonNullable<AccountModel['share']>> = {}) =>
  ({
    isOwner: false,
    permission: SHARE_PERMISSIONS.read,
    policy: null,
    owner: { id: 99, username: 'alice', avatar: null },
    accessSource: ACCESS_SOURCES.share,
    ...overrides,
  }) as NonNullable<AccountModel['share']>;

describe('useAccountAccess', () => {
  describe('isHouseholdGranted', () => {
    it('is true when share.accessSource === "household"', () => {
      const account = buildAccount({ share: buildShare({ accessSource: ACCESS_SOURCES.household }) });
      const { isHouseholdGranted } = useAccountAccess(ref(account));
      expect(isHouseholdGranted.value).toBe(true);
    });

    it('is false when share.accessSource === "share"', () => {
      const account = buildAccount({ share: buildShare({ accessSource: ACCESS_SOURCES.share }) });
      const { isHouseholdGranted } = useAccountAccess(ref(account));
      expect(isHouseholdGranted.value).toBe(false);
    });

    it('is false when share is absent (owner-side)', () => {
      const account = buildAccount();
      const { isHouseholdGranted, isOwner } = useAccountAccess(ref(account));
      expect(isOwner.value).toBe(true);
      expect(isHouseholdGranted.value).toBe(false);
    });
  });

  describe('basic share state derivation', () => {
    it('marks isSharedWithCaller when share.isOwner is false', () => {
      const account = buildAccount({ share: buildShare({ isOwner: false }) });
      const { isSharedWithCaller, isOwner, ownerHandle } = useAccountAccess(ref(account));
      expect(isSharedWithCaller.value).toBe(true);
      expect(isOwner.value).toBe(false);
      expect(ownerHandle.value).toBe('alice');
    });

    it('treats absent share as owner-side', () => {
      const account = buildAccount();
      const { isSharedWithCaller, isOwner, ownerHandle } = useAccountAccess(ref(account));
      expect(isSharedWithCaller.value).toBe(false);
      expect(isOwner.value).toBe(true);
      expect(ownerHandle.value).toBeNull();
    });
  });

  describe('canMutateTx', () => {
    it('blocks own-scope recipient from mutating other users transactions', () => {
      const account = buildAccount({
        share: buildShare({
          permission: SHARE_PERMISSIONS.write,
          policy: { transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.own },
        }),
      });
      const { canMutateTx } = useAccountAccess(ref(account));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tx = { userId: 42 } as any;
      expect(canMutateTx(tx, 7)).toBe(false);
      expect(canMutateTx(tx, 42)).toBe(true);
    });
  });
});
