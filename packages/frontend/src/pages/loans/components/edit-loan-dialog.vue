<script setup lang="ts">
import { type CreateLoanPayload, type LoanApi, type UpdateLoanPayload } from '@/api/loans';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { useUpdateLoan } from '@/composable/data-queries/loans';
import { ApiErrorResponseError, getApiErrorMessage } from '@/js/errors';
import { captureException } from '@/lib/sentry';
import { useI18n } from 'vue-i18n';

import LoanForm from './loan-form.vue';

const FORM_ID = 'edit-loan-form';

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
    // Surface the backend's validation message (e.g. an out-of-range balance
    // correction date) instead of a blanket failure toast. Conflict/validation
    // codes carry a user-facing message; anything else falls back to the generic
    // copy.
    addNotification({
      text: getApiErrorMessage({
        e: error,
        t,
        conflictKey: 'forms.loan.notifications.updateError',
        fallbackKey: 'forms.loan.notifications.updateError',
      }),
      type: NotificationType.error,
    });
    // A rejected validation is an expected user outcome already shown above –
    // only report genuinely unexpected failures to Sentry.
    if (!(error instanceof ApiErrorResponseError)) {
      captureException({ error, context: { source: 'editLoanDialog' } });
    }
  }
};
</script>

<template>
  <ResponsiveDialog :open="open" dialog-content-class="sm:max-w-2xl" @update:open="emit('update:open', $event)">
    <template #title>{{ $t('loans.dialog.editTitle') }}</template>
    <template #description>{{ $t('loans.dialog.editDescription') }}</template>

    <LoanForm
      mode="edit"
      :form-id="FORM_ID"
      :initial-loan="loan"
      :submitting="updateLoanMutation.isPending.value"
      @submit="handleSubmit"
    />

    <template #footer>
      <div class="flex justify-end gap-2">
        <UiButton
          type="button"
          variant="ghost"
          :disabled="updateLoanMutation.isPending.value"
          @click="emit('update:open', false)"
        >
          {{ $t('forms.loan.cancelButton') }}
        </UiButton>
        <UiButton type="submit" :form="FORM_ID" class="min-w-30" :disabled="updateLoanMutation.isPending.value">
          {{ updateLoanMutation.isPending.value ? $t('forms.loan.submitButtonLoading') : $t('forms.loan.saveButton') }}
        </UiButton>
      </div>
    </template>
  </ResponsiveDialog>
</template>
