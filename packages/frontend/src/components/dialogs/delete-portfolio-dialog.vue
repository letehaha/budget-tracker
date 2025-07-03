<template>
  <Dialog v-model:open="isOpen">
    <DialogTrigger as-child>
      <slot />
    </DialogTrigger>
    <DialogContent class="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>Delete Portfolio</DialogTitle>
        <DialogDescription>
          Are you sure you want to delete this portfolio? This action cannot be undone.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose as-child>
          <UiButton variant="ghost">Cancel</UiButton>
        </DialogClose>
        <UiButton variant="destructive" :disabled="deletePortfolioMutation.isPending.value" @click="handleDelete">
          <span v-if="deletePortfolioMutation.isPending.value">Deleting...</span>
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
import { useDeletePortfolio } from '@/composable/data-queries/portfolios';
import { ref } from 'vue';

const props = defineProps<{
  portfolioId: number;
}>();

const emit = defineEmits<{
  (e: 'deleted'): void;
}>();

const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const deletePortfolioMutation = useDeletePortfolio();
const isOpen = ref(false);

const handleDelete = async () => {
  try {
    await deletePortfolioMutation.mutateAsync(props.portfolioId);
    addSuccessNotification('Portfolio deleted successfully.');
    isOpen.value = false;
    emit('deleted');
  } catch {
    addErrorNotification('Failed to delete portfolio.');
  }
};
</script>
