<script setup lang="ts">
import { type CreateLoanPayload, type UpdateLoanPayload } from '@/api/loans';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { useCreateLoan } from '@/composable/data-queries/loans';
import { captureException } from '@/lib/sentry';
import { ROUTES_NAMES } from '@/routes';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

import LoanForm from './loan-form.vue';

const FORM_ID = 'create-loan-form';

const router = useRouter();
const { t } = useI18n();
const { addNotification } = useNotificationCenter();
const createLoanMutation = useCreateLoan();

const isOpen = ref(false);

const handleSubmit = async (payload: CreateLoanPayload | UpdateLoanPayload) => {
  try {
    const loan = await createLoanMutation.mutateAsync(payload as CreateLoanPayload);
    // Don't bother with closing dialog, navigating out will do it
    await router.push({ name: ROUTES_NAMES.loanDetail, params: { id: loan.id } });
    addNotification({ text: t('forms.loan.notifications.success'), type: NotificationType.success });
  } catch (error) {
    addNotification({ text: t('forms.loan.notifications.error'), type: NotificationType.error });
    captureException({ error, context: { source: 'createLoanDialog' } });
  }
};
</script>

<template>
  <ResponsiveDialog v-model:open="isOpen" dialog-content-class="sm:max-w-2xl">
    <template #trigger>
      <slot />
    </template>

    <template #title>{{ $t('loans.dialog.createTitle') }}</template>
    <template #description>{{ $t('loans.dialog.createDescription') }}</template>

    <LoanForm :form-id="FORM_ID" :submitting="createLoanMutation.isPending.value" @submit="handleSubmit" />

    <template #footer>
      <div class="flex justify-end gap-2">
        <UiButton type="button" variant="ghost" :disabled="createLoanMutation.isPending.value" @click="isOpen = false">
          {{ $t('forms.loan.cancelButton') }}
        </UiButton>
        <UiButton type="submit" :form="FORM_ID" class="min-w-30" :disabled="createLoanMutation.isPending.value">
          {{
            createLoanMutation.isPending.value ? $t('forms.loan.submitButtonLoading') : $t('forms.loan.submitButton')
          }}
        </UiButton>
      </div>
    </template>
  </ResponsiveDialog>
</template>
