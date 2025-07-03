<script setup lang="ts">
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import PortfolioSettingsForm from '@/components/forms/portfolio-settings-form.vue';
import type { PortfolioModel } from '@bt/shared/types/investments';
import { ref } from 'vue';

interface Emit {
  (e: 'updated'): void;
}

defineProps<{ portfolio: PortfolioModel }>();
const emit = defineEmits<Emit>();

const isOpen = ref(false);

const handleUpdated = () => {
  isOpen.value = false;
  emit('updated');
};
</script>

<template>
  <ResponsiveDialog v-model:open="isOpen">
    <template #trigger>
      <slot />
    </template>

    <template #title>Edit Portfolio</template>
    <template #description>Update name, type or description of your portfolio.</template>

    <PortfolioSettingsForm :portfolio="portfolio" @updated="handleUpdated" @cancel="isOpen = false" />
  </ResponsiveDialog>
</template>
