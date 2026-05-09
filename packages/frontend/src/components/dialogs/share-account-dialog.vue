<script setup lang="ts">
import { createShareInvitation } from '@/api/share';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import { InputField, SelectField } from '@/components/fields';
import { Button } from '@/components/lib/ui/button';
import { useNotificationCenter } from '@/components/notification-center';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const/vue-query';
import { ApiErrorResponseError } from '@/js/errors';
import {
  type AccountModel,
  RESOURCE_TYPES,
  SHARE_PERMISSIONS,
  type SharePermission,
  TRANSACTIONS_WRITE_SCOPES,
  type TransactionsWriteScope,
} from '@bt/shared/types';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  account: AccountModel;
  open?: boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const { t } = useI18n();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const queryClient = useQueryClient();

const isOpen = computed({
  get: () => props.open ?? internalOpen.value,
  set: (value) => {
    internalOpen.value = value;
    emit('update:open', value);
  },
});
const internalOpen = ref(false);

interface PermissionOption {
  label: string;
  value: SharePermission;
}
interface WriteScopeOption {
  label: string;
  value: TransactionsWriteScope;
}

const permissionOptions = computed<PermissionOption[]>(() => [
  { label: t('dialogs.shareAccountDialog.permissions.read'), value: SHARE_PERMISSIONS.read },
  { label: t('dialogs.shareAccountDialog.permissions.write'), value: SHARE_PERMISSIONS.write },
  { label: t('dialogs.shareAccountDialog.permissions.manage'), value: SHARE_PERMISSIONS.manage },
]);

const writeScopeOptions = computed<WriteScopeOption[]>(() => [
  { label: t('dialogs.shareAccountDialog.writeScope.all'), value: TRANSACTIONS_WRITE_SCOPES.all },
  { label: t('dialogs.shareAccountDialog.writeScope.own'), value: TRANSACTIONS_WRITE_SCOPES.own },
]);

const email = ref('');
// SelectField binds to the full option object (its modelValue is `T | null` where
// `T extends Record<string, any>`). Storing the object lets the component round-trip
// labels correctly without manual lookup.
const permission = ref<PermissionOption>(permissionOptions.value[0]!);
const writeScope = ref<WriteScopeOption>(writeScopeOptions.value[0]!);

const showsWriteScope = computed(() => permission.value.value !== SHARE_PERMISSIONS.read);

// Reset form whenever the dialog opens — avoids stale state across multiple invitations.
watch(isOpen, (open) => {
  if (open) {
    email.value = '';
    permission.value = permissionOptions.value[0]!;
    writeScope.value = writeScopeOptions.value[0]!;
  }
});

const isEmailValid = computed(() => /.+@.+\..+/.test(email.value.trim()));
const canSubmit = computed(() => isEmailValid.value && !mutation.isPending.value);

const mutation = useMutation({
  mutationFn: () =>
    createShareInvitation({
      inviteeEmail: email.value.trim(),
      resourceType: RESOURCE_TYPES.account,
      resourceId: props.account.id,
      permission: permission.value.value,
      policy: showsWriteScope.value ? { transactionsWriteScope: writeScope.value.value } : null,
    }),
  onSuccess: () => {
    // Generic copy on purpose — the response shape is identical whether the email is
    // registered or not, so we don't reveal that here either (PRD D6).
    addSuccessNotification(t('dialogs.shareAccountDialog.success'));
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.shareInvitationsSent });
    isOpen.value = false;
  },
  onError: (err: unknown) => {
    const message = err instanceof ApiErrorResponseError ? err.data?.message : undefined;
    addErrorNotification(message || t('dialogs.shareAccountDialog.error'));
  },
});

const submit = () => {
  if (!canSubmit.value) return;
  mutation.mutate();
};
</script>

<template>
  <ResponsiveDialog v-model:open="isOpen">
    <template #title>{{ $t('dialogs.shareAccountDialog.title') }}</template>
    <template #description>
      {{ $t('dialogs.shareAccountDialog.description', { name: account.name }) }}
    </template>

    <form class="grid gap-4" @submit.prevent="submit">
      <InputField
        v-model="email"
        :label="$t('dialogs.shareAccountDialog.emailLabel')"
        :placeholder="$t('dialogs.shareAccountDialog.emailPlaceholder')"
        type="email"
        autocomplete="email"
      />

      <SelectField
        v-model="permission"
        :label="$t('dialogs.shareAccountDialog.permissionLabel')"
        :values="permissionOptions"
        label-key="label"
        value-key="value"
      />

      <template v-if="showsWriteScope">
        <SelectField
          v-model="writeScope"
          :label="$t('dialogs.shareAccountDialog.writeScopeLabel')"
          :values="writeScopeOptions"
          label-key="label"
          value-key="value"
        />
      </template>

      <div class="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" :disabled="mutation.isPending.value" @click="isOpen = false">
          {{ $t('dialogs.shareAccountDialog.cancel') }}
        </Button>
        <Button type="submit" :disabled="!canSubmit" :loading="mutation.isPending.value">
          {{ $t('dialogs.shareAccountDialog.send') }}
        </Button>
      </div>
    </form>
  </ResponsiveDialog>
</template>
