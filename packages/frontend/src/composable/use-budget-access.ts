import { type BudgetModel, SHARE_PERMISSIONS } from '@bt/shared/types';
import { type MaybeRefOrGetter, computed, toValue } from 'vue';

/**
 * Share-derived auth state for a budget. Mirrors the backend `canUserAccessResource`
 * rules so the UI hides exactly what the API would refuse.
 *
 * Reduced-scope semantics (PRD decision):
 *  - `canWrite` = recipient can attach / detach **their own** transactions on a manual
 *    budget. It does NOT cover metadata edits — those require `manage`.
 *  - `canManage` = edit metadata, archive/unarchive, invite or revoke members.
 *  - Delete is owner-only and never exposed through this composable (use `isOwner`).
 *
 * `share` absent (legacy / internal callers) is treated as owned — same fallback as
 * `useAccountAccess`.
 */
export const useBudgetAccess = (budget: MaybeRefOrGetter<BudgetModel | undefined | null>) => {
  const share = computed(() => toValue(budget)?.share);

  const isOwner = computed(() => share.value?.isOwner ?? true);

  /**
   * True only when the budget is shared *with* the caller. Owner-side `share` blocks
   * (`isOwner === true`) don't count — the caller IS the owner.
   */
  const isSharedWithCaller = computed(() => !!share.value && !share.value.isOwner);

  const permission = computed(() => share.value?.permission ?? null);
  const ownerHandle = computed(() => (isSharedWithCaller.value ? share.value!.owner.username : null));

  const canManage = computed(() => {
    if (isOwner.value) return true;
    return permission.value === SHARE_PERMISSIONS.manage;
  });

  const canWrite = computed(() => {
    if (isOwner.value) return true;
    return permission.value === SHARE_PERMISSIONS.write || permission.value === SHARE_PERMISSIONS.manage;
  });

  return {
    share,
    isOwner,
    isSharedWithCaller,
    permission,
    ownerHandle,
    canManage,
    canWrite,
  };
};
