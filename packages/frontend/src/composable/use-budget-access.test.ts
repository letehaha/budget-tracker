import { ACCESS_SOURCES, type BudgetModel, SHARE_PERMISSIONS } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';
import { ref } from 'vue';

import { useBudgetAccess } from './use-budget-access';

const buildBudget = (overrides: Partial<BudgetModel> = {}): BudgetModel =>
  ({
    id: 'budget-1',
    name: 'Groceries',
    ...overrides,
  }) as BudgetModel;

const buildShare = (overrides: Partial<NonNullable<BudgetModel['share']>> = {}) =>
  ({
    isOwner: false,
    permission: SHARE_PERMISSIONS.read,
    policy: null,
    owner: { id: 99, username: 'alice', avatar: null },
    accessSource: ACCESS_SOURCES.share,
    ...overrides,
  }) as NonNullable<BudgetModel['share']>;

describe('useBudgetAccess', () => {
  describe('owner-side (no share field)', () => {
    it('treats absent share as owner-side', () => {
      const { isOwner, isSharedWithCaller, ownerHandle, canManage, canWrite } = useBudgetAccess(ref(buildBudget()));
      expect(isOwner.value).toBe(true);
      expect(isSharedWithCaller.value).toBe(false);
      expect(ownerHandle.value).toBeNull();
      expect(canManage.value).toBe(true);
      expect(canWrite.value).toBe(true);
    });

    it('treats explicit owner-side share as owned', () => {
      const budget = buildBudget({
        share: buildShare({ isOwner: true, accessSource: ACCESS_SOURCES.owner, permission: SHARE_PERMISSIONS.manage }),
      });
      const { isOwner, isSharedWithCaller, canManage, canWrite } = useBudgetAccess(ref(budget));
      expect(isOwner.value).toBe(true);
      expect(isSharedWithCaller.value).toBe(false);
      expect(canManage.value).toBe(true);
      expect(canWrite.value).toBe(true);
    });
  });

  describe('shared recipient — read permission', () => {
    it('reports read permission and locks down all writes', () => {
      const budget = buildBudget({ share: buildShare({ permission: SHARE_PERMISSIONS.read }) });
      const { isOwner, isSharedWithCaller, permission, ownerHandle, canManage, canWrite } = useBudgetAccess(
        ref(budget),
      );
      expect(isOwner.value).toBe(false);
      expect(isSharedWithCaller.value).toBe(true);
      expect(permission.value).toBe(SHARE_PERMISSIONS.read);
      expect(ownerHandle.value).toBe('alice');
      expect(canManage.value).toBe(false);
      expect(canWrite.value).toBe(false);
    });
  });

  describe('shared recipient — write permission', () => {
    it('allows canWrite but blocks canManage', () => {
      const budget = buildBudget({ share: buildShare({ permission: SHARE_PERMISSIONS.write }) });
      const { canManage, canWrite, isOwner } = useBudgetAccess(ref(budget));
      expect(isOwner.value).toBe(false);
      expect(canWrite.value).toBe(true);
      expect(canManage.value).toBe(false);
    });
  });

  describe('shared recipient — manage permission', () => {
    it('allows both canWrite and canManage (manage escalates to write)', () => {
      const budget = buildBudget({ share: buildShare({ permission: SHARE_PERMISSIONS.manage }) });
      const { canManage, canWrite, isOwner } = useBudgetAccess(ref(budget));
      expect(isOwner.value).toBe(false);
      expect(canWrite.value).toBe(true);
      expect(canManage.value).toBe(true);
    });
  });

  describe('null / undefined budget', () => {
    it('returns owner-defaulted state when budget is null', () => {
      const { isOwner, isSharedWithCaller, canManage, canWrite, ownerHandle } = useBudgetAccess(ref(null));
      // share absent ⇒ `?? true` fallback ⇒ owner-side defaults (matches useAccountAccess
      // behaviour). The UI gates on `canManage`/`canWrite` only when a budget is loaded,
      // so this default doesn't unlock anything in practice.
      expect(isOwner.value).toBe(true);
      expect(isSharedWithCaller.value).toBe(false);
      expect(ownerHandle.value).toBeNull();
      expect(canManage.value).toBe(true);
      expect(canWrite.value).toBe(true);
    });
  });
});
