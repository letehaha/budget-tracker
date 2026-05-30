<script setup lang="ts">
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import CreateVehicleForm from '@/components/forms/create-vehicle-form.vue';
import { isMobileSheetOpen } from '@/composable/global-state/mobile-sheet';
import { ref } from 'vue';

const emit = defineEmits(['created']);

const isOpen = ref(false);

const onCreated = () => {
  isOpen.value = false;
  isMobileSheetOpen.value = false;
  emit('created');
};
</script>

<template>
  <ResponsiveDialog v-model:open="isOpen">
    <template #trigger>
      <slot />
    </template>

    <template #title>{{ $t('common.dialogs.createVehicle') }}</template>

    <CreateVehicleForm @created="onCreated" />
  </ResponsiveDialog>
</template>
