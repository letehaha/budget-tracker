import {
  type AccountModel,
  SHARE_PERMISSIONS,
  type TransactionModel,
  TRANSACTIONS_WRITE_SCOPES,
} from '@bt/shared/types';
import { type MaybeRefOrGetter, computed, toValue } from 'vue';

/**
 * Single source of truth for share-derived auth state on an account.
 *
 * Mirrors the backend `canUserAccessResource` rules so disabled / hidden UI matches what
 * the API would accept. `share` absent (legacy / internal callers) is treated as owned.
 */
export const useAccountAccess = (account: MaybeRefOrGetter<AccountModel | undefined | null>) => {
  const share = computed(() => toValue(account)?.share);

  const isOwner = computed(() => share.value?.isOwner ?? true);

  // True only when the account is shared *with* the caller. Owner-side `share` blocks
  // (`isOwner === true`) don't count — the caller IS the owner.
  const isSharedWithCaller = computed(() => !!share.value && !share.value.isOwner);

  const permission = computed(() => share.value?.permission ?? null);
  const writeScope = computed(() => share.value?.policy?.transactionsWriteScope ?? null);
  const ownerHandle = computed(() => (isSharedWithCaller.value ? share.value!.owner.username : null));

  const canWriteToAccount = computed(() => {
    if (isOwner.value) return true;
    return permission.value === SHARE_PERMISSIONS.write || permission.value === SHARE_PERMISSIONS.manage;
  });

  /**
   * Whether the caller can mutate a specific transaction on this account.
   *
   * Recipients with `transactionsWriteScope: 'own'` can only edit/delete their own rows;
   * `'all'` and owners always pass. For creates, pass `tx = null` (caller becomes the
   * new row's userId, so write-scope never blocks).
   */
  const canMutateTx = (tx: TransactionModel | null | undefined, callerUserId: number | null | undefined) => {
    if (!canWriteToAccount.value) return false;
    if (isOwner.value) return true;
    if (!tx) return true;
    if (writeScope.value === TRANSACTIONS_WRITE_SCOPES.own && tx.userId !== callerUserId) return false;
    return true;
  };

  return {
    share,
    isOwner,
    isSharedWithCaller,
    permission,
    writeScope,
    ownerHandle,
    canWriteToAccount,
    canMutateTx,
  };
};
