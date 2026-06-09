<script setup lang="ts">
import { type CreateLoanPayload, type UpdateLoanPayload } from '@/api/loans';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { useCreateLoan } from '@/composable/data-queries/loans';
import { captureException } from '@/lib/sentry';
import { ROUTES_NAMES } from '@/routes';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

import LoanForm from './loan-form.vue';

const router = useRouter();
const { t } = useI18n();
const { addNotification } = useNotificationCenter();
const createLoanMutation = useCreateLoan();

const isOpen = ref(false);

const handleSubmit = async (payload: CreateLoanPayload | UpdateLoanPayload) => {
  try {
    const loan = await createLoanMutation.mutateAsync(payload as CreateLoanPayload);
    addNotification({ text: t('forms.loan.notifications.success'), type: NotificationType.success });
    isOpen.value = false;
    await router.push({ name: ROUTES_NAMES.loanDetail, params: { id: loan.id } });
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

    <LoanForm :submitting="createLoanMutation.isPending.value" @submit="handleSubmit" @cancel="isOpen = false" />
  </ResponsiveDialog>
</template>
