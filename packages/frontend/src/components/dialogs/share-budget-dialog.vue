<script setup lang="ts">
import { createShareInvitation } from '@/api/share';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const/vue-query';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import DemoRestricted from '@/components/demo/demo-restricted.vue';
import { InputField, SelectField } from '@/components/fields';
import { Button } from '@/components/lib/ui/button';
import { useNotificationCenter } from '@/components/notification-center';
import { ApiErrorResponseError } from '@/js/errors';
import { useUserStore } from '@/stores';
import { type BudgetModel, RESOURCE_TYPES, SHARE_PERMISSIONS, type SharePermission } from '@bt/shared/types';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

/**
 * Per-budget share invitation dialog. Mirrors `share-account-dialog.vue` but drops:
 *  - The transactions-write-scope select — budgets have no per-tx policy in MVP. A
 *    recipient with `write` can attach only their own transactions; `manage` covers
 *    everything else. There is nothing for a scope toggle to mean.
 *  - The household-override hint — budgets are explicit-share only (no household
 *    auto-grant), so a per-resource share never "overrides" a household grant.
 */

const props = defineProps<{
  budget: BudgetModel;
  open?: boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const { t } = useI18n();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const queryClient = useQueryClient();
const { isDemo } = storeToRefs(useUserStore());

const internalOpen = ref(false);
const isOpen = computed({
  get: () => props.open ?? internalOpen.value,
  set: (value) => {
    internalOpen.value = value;
    emit('update:open', value);
  },
});

interface PermissionOption {
  label: string;
  value: SharePermission;
}

const permissionOptions = computed<PermissionOption[]>(() => [
  { label: t('dialogs.shareBudgetDialog.permissions.read'), value: SHARE_PERMISSIONS.read },
  { label: t('dialogs.shareBudgetDialog.permissions.write'), value: SHARE_PERMISSIONS.write },
  { label: t('dialogs.shareBudgetDialog.permissions.manage'), value: SHARE_PERMISSIONS.manage },
]);

const email = ref('');
const permission = ref<PermissionOption>(permissionOptions.value[0]!);

watch(isOpen, (open) => {
  if (open) {
    email.value = '';
    permission.value = permissionOptions.value[0]!;
  }
});

const isEmailValid = computed(() => /.+@.+\..+/.test(email.value.trim()));
const canSubmit = computed(() => isEmailValid.value && !mutation.isPending.value);

const mutation = useMutation({
  mutationFn: () =>
    createShareInvitation({
      inviteeEmail: email.value.trim(),
      resourceType: RESOURCE_TYPES.budget,
      resourceId: props.budget.id,
      permission: permission.value.value,
      // No `policy` for budgets in MVP — backend ignores it for budget resources.
      policy: null,
    }),
  onSuccess: (data) => {
    if (data.emailDelivered === false) {
      addErrorNotification(t('dialogs.shareBudgetDialog.emailSendFailedWarning'));
    } else {
      addSuccessNotification(t('dialogs.shareBudgetDialog.success'));
    }
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.shareInvitationsSent });
    isOpen.value = false;
  },
  onError: (err: unknown) => {
    const message = err instanceof ApiErrorResponseError ? err.data?.message : undefined;
    addErrorNotification(message || t('dialogs.shareBudgetDialog.error'));
  },
});

const submit = () => {
  if (!canSubmit.value) return;
  mutation.mutate();
};
</script>

<template>
  <ResponsiveDialog v-model:open="isOpen">
    <template #title>{{ $t('dialogs.shareBudgetDialog.title') }}</template>
    <template #description>
      {{ $t('dialogs.shareBudgetDialog.description', { name: budget.name }) }}
    </template>

    <form class="grid gap-4" @submit.prevent="submit">
      <InputField
        v-model="email"
        :label="$t('dialogs.shareBudgetDialog.emailLabel')"
        :placeholder="$t('dialogs.shareBudgetDialog.emailPlaceholder')"
        type="email"
        autocomplete="email"
      />

      <SelectField
        v-model="permission"
        :label="$t('dialogs.shareBudgetDialog.permissionLabel')"
        :values="permissionOptions"
        label-key="label"
        value-key="value"
      />

      <div class="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" :disabled="mutation.isPending.value" @click="isOpen = false">
          {{ $t('dialogs.shareBudgetDialog.cancel') }}
        </Button>
        <DemoRestricted>
          <Button type="submit" :disabled="!canSubmit || isDemo" :loading="mutation.isPending.value">
            {{ $t('dialogs.shareBudgetDialog.send') }}
          </Button>
        </DemoRestricted>
      </div>
    </form>
  </ResponsiveDialog>
</template>
