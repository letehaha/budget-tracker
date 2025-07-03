<script setup lang="ts">
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import PortfolioTransferForm from '@/components/forms/portfolio-transfer-form.vue';
import type { TransferContext } from '@/composable/data-queries/portfolio-transfers';
import type { AccountModel, PortfolioModel } from '@bt/shared/types';
import { ref } from 'vue';

interface Emit {
  (e: 'success'): void;
}

const props = defineProps<{
  /** Transfer context - determines form behavior */
  context: TransferContext;
  /** Initial portfolio (when context is 'portfolio') */
  portfolio?: PortfolioModel;
  /** Initial account (when context is 'account') */
  account?: AccountModel;
}>();

const emit = defineEmits<Emit>();

const isOpen = ref(false);

const handleSuccess = () => {
  isOpen.value = false;
  emit('success');
};

const handleCancel = () => {
  isOpen.value = false;
};

// Dynamic title and description based on context
const dialogTitle = props.context === 'portfolio' ? 'Transfer from Portfolio' : 'Transfer from Account';
const dialogDescription = props.context === 'portfolio' 
  ? 'Transfer funds from this portfolio to another portfolio or account.'
  : 'Transfer funds from this account to a portfolio.';
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