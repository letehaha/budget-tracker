<script setup lang="ts">
import EntityLogoPicker from '@/components/common/entity-logo-picker.vue';
import { toLogoPayload } from '@/components/common/logo-selection';
import { useAccountsStore } from '@/stores';
import type { EntityLogoPayload } from '@bt/shared/types';
import { computed } from 'vue';

const props = defineProps<{
  open: boolean;
  accountId: string;
  accountName: string;
  currentDomain: string | null;
  currentInitials?: string | null;
  currentColor?: string | null;
}>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
}>();

const isOpen = computed({
  get: () => props.open,
  set: (v) => emit('update:open', v),
});

const accountsStore = useAccountsStore();

const save = ({ payload }: { payload: EntityLogoPayload }) =>
  accountsStore.editAccount({ id: props.accountId, ...payload });
const reset = () => save({ payload: toLogoPayload({ selection: null }) });
</script>

<template>
  <EntityLogoPicker
    v-model:open="isOpen"
    :name-for-search="accountName"
    :current-domain="currentDomain"
    :current-initials="currentInitials"
    :current-color="currentColor"
    :title="$t('pages.account.logo.dialogTitle')"
    :description="$t('pages.account.logo.dialogDescription')"
    :reset-label="$t('common.logo.remove')"
    :saved-message="$t('pages.account.logo.updatedToast')"
    :reset-message="$t('pages.account.logo.resetToast')"
    :error-message="$t('pages.account.logo.error')"
    flow="accountLogo"
    :save="save"
    :reset="reset"
  />
</template>
