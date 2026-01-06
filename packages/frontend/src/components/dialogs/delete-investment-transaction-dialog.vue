<template>
  <ResponsiveDialog v-model:open="isOpen" dialog-content-class="sm:max-w-[425px]">
    <template #trigger>
      <slot />
    </template>

    <template #title>Delete Transaction</template>
    <template #description>
      Are you sure you want to delete this transaction? This action cannot be undone.
    </template>

    <template #footer="{ close }">
      <UiButton variant="ghost" @click="close">Cancel</UiButton>
      <UiButton variant="destructive" :disabled="deleteTransactionMutation.isPending.value" @click="handleDelete">
        <span v-if="deleteTransactionMutation.isPending.value">Deleting...</span>
        <span v-else>Delete</span>
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
    addSuccessNotification('Transaction deleted successfully.');
    isOpen.value = false;
    emit('deleted');
  } catch {
    addErrorNotification('Failed to delete transaction.');
  }
};
</script>
