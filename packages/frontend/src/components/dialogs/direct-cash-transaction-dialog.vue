<script setup lang="ts">
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import DirectCashTransactionForm from '@/components/forms/direct-cash-transaction-form.vue';
import { ref } from 'vue';

interface Emit {
  (e: 'success'): void;
}

const props = defineProps<{
  portfolioId: number;
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
</script>

<template>
  <ResponsiveDialog v-model:open="isOpen">
    <template #trigger>
      <slot />
    </template>

    <template #title>{{ $t('dialogs.directCashTransaction.title') }}</template>
    <template #description>{{ $t('dialogs.directCashTransaction.description') }}</template>

    <DirectCashTransactionForm :portfolio-id="props.portfolioId" @success="handleSuccess" @cancel="handleCancel" />
  </ResponsiveDialog>
</template>
