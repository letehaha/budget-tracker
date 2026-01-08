<template>
  <ResponsiveDialog v-model:open="isOpen" dialog-content-class="sm:max-w-[425px]">
    <template #trigger>
      <slot />
    </template>

    <template #title>{{ $t('dialogs.deletePortfolio.title') }}</template>
    <template #description>
      {{ $t('dialogs.deletePortfolio.description') }}
    </template>

    <template #footer="{ close }">
      <UiButton variant="ghost" @click="close">{{ $t('dialogs.deletePortfolio.cancelButton') }}</UiButton>
      <UiButton variant="destructive" :disabled="deletePortfolioMutation.isPending.value" @click="handleDelete">
        <span v-if="deletePortfolioMutation.isPending.value">{{
          $t('dialogs.deletePortfolio.deleteButtonLoading')
        }}</span>
        <span v-else>{{ $t('dialogs.deletePortfolio.deleteButton') }}</span>
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
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

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
    addSuccessNotification(t('dialogs.deletePortfolio.notifications.success'));
    isOpen.value = false;
    emit('deleted');
  } catch {
    addErrorNotification(t('dialogs.deletePortfolio.notifications.error'));
  }
};
</script>
