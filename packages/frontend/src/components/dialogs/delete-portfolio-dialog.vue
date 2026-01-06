<template>
  <ResponsiveDialog v-model:open="isOpen" dialog-content-class="sm:max-w-[425px]">
    <template #trigger>
      <slot />
    </template>

    <template #title>Delete Portfolio</template>
    <template #description>
      Are you sure you want to delete this portfolio? This action cannot be undone.
    </template>

    <template #footer="{ close }">
      <UiButton variant="ghost" @click="close">Cancel</UiButton>
      <UiButton variant="destructive" :disabled="deletePortfolioMutation.isPending.value" @click="handleDelete">
        <span v-if="deletePortfolioMutation.isPending.value">Deleting...</span>
        <span v-else>Delete</span>
      </UiButton>
    </template>
  </ResponsiveDialog>
</template>

<script setup lang="ts">
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
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
