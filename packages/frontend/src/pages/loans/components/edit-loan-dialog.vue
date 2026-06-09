<script setup lang="ts">
import { type CreateLoanPayload, type LoanApi, type UpdateLoanPayload } from '@/api/loans';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { useUpdateLoan } from '@/composable/data-queries/loans';
import { captureException } from '@/lib/sentry';
import { useI18n } from 'vue-i18n';

import LoanForm from './loan-form.vue';

const props = defineProps<{ open: boolean; loan: LoanApi }>();
const emit = defineEmits<{ 'update:open': [value: boolean] }>();

const { t } = useI18n();
const { addNotification } = useNotificationCenter();
const updateLoanMutation = useUpdateLoan();

const handleSubmit = async (payload: CreateLoanPayload | UpdateLoanPayload) => {
  try {
    await updateLoanMutation.mutateAsync({ id: props.loan.id, ...(payload as UpdateLoanPayload) });
    addNotification({ text: t('forms.loan.notifications.updateSuccess'), type: NotificationType.success });
    emit('update:open', false);
  } catch (error) {
    addNotification({ text: t('forms.loan.notifications.updateError'), type: NotificationType.error });
    captureException({ error, context: { source: 'editLoanDialog' } });
  }
};
</script>

<template>
  <ResponsiveDialog :open="open" dialog-content-class="sm:max-w-2xl" @update:open="emit('update:open', $event)">
    <template #title>{{ $t('loans.dialog.editTitle') }}</template>
    <template #description>{{ $t('loans.dialog.editDescription') }}</template>

    <LoanForm
      mode="edit"
      :initial-loan="loan"
      :submitting="updateLoanMutation.isPending.value"
      :submit-label="$t('forms.loan.saveButton')"
      @submit="handleSubmit"
      @cancel="emit('update:open', false)"
    />
  </ResponsiveDialog>
</template>
