<template>
  <Dialog v-model:open="isOpen">
    <DialogTrigger as-child>
      <slot />
    </DialogTrigger>
    <DialogContent class="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>Delete Transaction</DialogTitle>
        <DialogDescription>
          Are you sure you want to delete this transaction? This action cannot be undone.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose as-child>
          <UiButton variant="ghost">Cancel</UiButton>
        </DialogClose>
        <UiButton variant="destructive" :disabled="deleteTransactionMutation.isPending.value" @click="handleDelete">
          <span v-if="deleteTransactionMutation.isPending.value">Deleting...</span>
          <span v-else>Delete</span>
        </UiButton>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import UiButton from '@/components/lib/ui/button/Button.vue';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/lib/ui/dialog';
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