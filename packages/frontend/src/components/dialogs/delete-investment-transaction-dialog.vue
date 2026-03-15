<template>
  <ResponsiveDialog v-model:open="isOpen" dialog-content-class="sm:max-w-[425px]">
    <template #trigger>
      <slot />
    </template>

    <template #title>{{ $t('dialogs.deleteInvestmentTransaction.title') }}</template>
    <template #description>
      {{ $t('dialogs.deleteInvestmentTransaction.description') }}
    </template>

    <template #footer="{ close }">
      <UiButton variant="ghost" @click="close">{{ $t('dialogs.deleteInvestmentTransaction.cancelButton') }}</UiButton>
      <UiButton variant="destructive" :disabled="deleteTransactionMutation.isPending.value" @click="handleDelete">
        <span v-if="deleteTransactionMutation.isPending.value">{{
          $t('dialogs.deleteInvestmentTransaction.deleteButtonLoading')
        }}</span>
        <span v-else>{{ $t('dialogs.deleteInvestmentTransaction.deleteButton') }}</span>
      </UiButton>
    </template>
  </ResponsiveDialog>
</template>

<script setup lang="ts">
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { useNotificationCenter } from '@/components/notification-center';
import { useDeleteInvestmentTransaction } from '@/composable/data-queries/investment-transactions';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{
  transactionId: number;
}>();

const emit = defineEmits<{
  (e: 'deleted'): void;
}>();

const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const deleteTransactionMutation = useDeleteInvestmentTransaction();
const isOpen = ref(false);

const handleDelete = async () => {
  try {
    await deleteTransactionMutation.mutateAsync(props.transactionId);
    addSuccessNotification(t('dialogs.deleteInvestmentTransaction.notifications.success'));
    isOpen.value = false;
    emit('deleted');
  } catch {
    addErrorNotification(t('dialogs.deleteInvestmentTransaction.notifications.error'));
  }
};
</script>
