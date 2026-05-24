import { createShareInvitation } from '@/api/share';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const/vue-query';
import { useNotificationCenter } from '@/components/notification-center';
import { ApiErrorResponseError } from '@/js/errors';
import {
  type RecordId,
  type ResourceType,
  SHARE_PERMISSIONS,
  type SharePermission,
  type SharePolicy,
  TRANSACTIONS_WRITE_SCOPES,
  type TransactionsWriteScope,
} from '@bt/shared/types';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { type MaybeRefOrGetter, type Ref, computed, ref, toValue, watch } from 'vue';
import { useI18n } from 'vue-i18n';

interface PermissionOption {
  label: string;
  value: SharePermission;
}

interface WriteScopeOption {
  label: string;
  value: TransactionsWriteScope;
}

interface UseShareInvitationDialogOptions {
  resourceType: ResourceType;
  resourceId: MaybeRefOrGetter<RecordId | string>;
  /** The dialog's open ref. Used to reset the form on open and to close on success. */
  isOpen: Ref<boolean | undefined>;
  /**
   * i18n namespace owned by the calling dialog (e.g. `'dialogs.shareAccountDialog'`).
   * Composable reads `<ns>.permissions.{read,write,manage}`, `<ns>.success`, `<ns>.error`,
   * `<ns>.emailSendFailedWarning`, and — when `withWriteScope` is true —
   * `<ns>.writeScope.{all,own}`.
   */
  i18nNamespace: string;
  /** Show + send the transactions-write-scope policy (account dialog only). */
  withWriteScope?: boolean;
  /** Extra side-effect run after a successful invitation send (e.g. onboarding task completion). */
  onSuccess?: () => void;
}

/**
 * Shared form / mutation logic for per-resource share-invitation dialogs.
 * Owns email + permission (+ optional write-scope) state, validation, reset-on-open,
 * and the createShareInvitation mutation with the project's notification + cache
 * invalidation conventions.
 */
export const useShareInvitationDialog = ({
  resourceType,
  resourceId,
  isOpen,
  i18nNamespace,
  withWriteScope = false,
  onSuccess,
}: UseShareInvitationDialogOptions) => {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { addSuccessNotification, addErrorNotification } = useNotificationCenter();

  const permissionOptions = computed<PermissionOption[]>(() => [
    { label: t(`${i18nNamespace}.permissions.read`), value: SHARE_PERMISSIONS.read },
    { label: t(`${i18nNamespace}.permissions.write`), value: SHARE_PERMISSIONS.write },
    { label: t(`${i18nNamespace}.permissions.manage`), value: SHARE_PERMISSIONS.manage },
  ]);

  const writeScopeOptions = computed<WriteScopeOption[]>(() => [
    { label: t(`${i18nNamespace}.writeScope.all`), value: TRANSACTIONS_WRITE_SCOPES.all },
    { label: t(`${i18nNamespace}.writeScope.own`), value: TRANSACTIONS_WRITE_SCOPES.own },
  ]);

  const email = ref('');
  const permission = ref<PermissionOption>(permissionOptions.value[0]!);
  const writeScope = ref<WriteScopeOption>(writeScopeOptions.value[0]!);

  const showsWriteScope = computed(() => withWriteScope && permission.value.value !== SHARE_PERMISSIONS.read);

  watch(isOpen, (open) => {
    if (!open) return;
    email.value = '';
    permission.value = permissionOptions.value[0]!;
    if (withWriteScope) {
      writeScope.value = writeScopeOptions.value[0]!;
    }
  });

  const isEmailValid = computed(() => /.+@.+\..+/.test(email.value.trim()));

  const mutation = useMutation({
    mutationFn: () => {
      const policy: SharePolicy | null = showsWriteScope.value
        ? { transactionsWriteScope: writeScope.value.value }
        : null;
      return createShareInvitation({
        inviteeEmail: email.value.trim(),
        resourceType,
        resourceId: toValue(resourceId),
        permission: permission.value.value,
        policy,
      });
    },
    onSuccess: (data) => {
      if (data.emailDelivered === false) {
        addErrorNotification(t(`${i18nNamespace}.emailSendFailedWarning`));
      } else {
        addSuccessNotification(t(`${i18nNamespace}.success`));
      }
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.shareInvitationsSent });
      onSuccess?.();
      isOpen.value = false;
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiErrorResponseError ? err.data?.message : undefined;
      addErrorNotification(message || t(`${i18nNamespace}.error`));
    },
  });

  const canSubmit = computed(() => isEmailValid.value && !mutation.isPending.value);

  const submit = () => {
    if (!canSubmit.value) return;
    mutation.mutate();
  };

  return {
    email,
    permission,
    permissionOptions,
    writeScope,
    writeScopeOptions,
    showsWriteScope,
    isEmailValid,
    canSubmit,
    mutation,
    submit,
  };
};
