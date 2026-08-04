<script setup lang="ts">
import EntityLogoPicker from '@/components/common/entity-logo-picker.vue';
import { useResetPayeeLogo, useUpdatePayee } from '@/composable/data-queries/payees';
import type { EntityLogoPayload } from '@bt/shared/types';
import { computed } from 'vue';

const props = defineProps<{
  open: boolean;
  payeeId: string;
  payeeName: string;
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

const updateMut = useUpdatePayee();
const resetMut = useResetPayeeLogo();

const save = ({ payload }: { payload: EntityLogoPayload }) => updateMut.mutateAsync({ id: props.payeeId, payload });
const reset = () => resetMut.mutateAsync({ id: props.payeeId });
</script>

<template>
  <EntityLogoPicker
    v-model:open="isOpen"
    :name-for-search="payeeName"
    :current-domain="currentDomain"
    :current-initials="currentInitials"
    :current-color="currentColor"
    :title="$t('payees.logo.dialogTitle')"
    :description="$t('payees.logo.dialogDescription')"
    :reset-label="$t('payees.logo.resetToAuto')"
    :saved-message="$t('payees.logo.updatedToast')"
    :reset-message="$t('payees.logo.resetToast')"
    :error-message="$t('payees.errors.generic')"
    flow="payeeLogo"
    :save="save"
    :reset="reset"
  />
</template>
