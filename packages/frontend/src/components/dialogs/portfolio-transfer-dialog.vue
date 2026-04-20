<script setup lang="ts">
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import PortfolioTransferForm from '@/components/forms/portfolio-transfer-form.vue';
import type { TransferContext } from '@/composable/data-queries/portfolio-transfers';
import type { AccountModel, PortfolioModel } from '@bt/shared/types';
import { useVModel } from '@vueuse/core';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{
  /** Transfer context - determines form behavior */
  context: TransferContext;
  /** Initial portfolio (when context is 'portfolio') */
  portfolio?: PortfolioModel;
  /** Initial account (when context is 'account') */
  account?: AccountModel;
  open?: boolean;
}>();

const emit = defineEmits<{
  (e: 'success'): void;
  (e: 'update:open', value: boolean): void;
}>();

const isOpen = useVModel(props, 'open', emit, { passive: true });

const handleSuccess = () => {
  isOpen.value = false;
  emit('success');
};

const handleCancel = () => {
  isOpen.value = false;
};

// Dynamic title and description based on context
const dialogTitle = computed(() =>
  props.context === 'portfolio'
    ? t('dialogs.portfolioTransfer.portfolio.title')
    : t('dialogs.portfolioTransfer.account.title'),
);
const dialogDescription = computed(() =>
  props.context === 'portfolio'
    ? t('dialogs.portfolioTransfer.portfolio.description')
    : t('dialogs.portfolioTransfer.account.description'),
);
</script>

<template>
  <ResponsiveDialog v-model:open="isOpen">
    <template #trigger>
      <slot />
    </template>

    <template #title>{{ dialogTitle }}</template>
    <template #description>{{ dialogDescription }}</template>

    <PortfolioTransferForm
      :context="context"
      :initial-portfolio="portfolio"
      :initial-account="account"
      @success="handleSuccess"
      @cancel="handleCancel"
    />
  </ResponsiveDialog>
</template>
