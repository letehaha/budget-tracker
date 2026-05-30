<script setup lang="ts">
import type { VehicleModel } from '@/api/vehicles';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import EditVehicleForm from '@/components/forms/edit-vehicle-form.vue';
import { isMobileSheetOpen } from '@/composable/global-state/mobile-sheet';

defineProps<{ vehicle: VehicleModel }>();
const open = defineModel<boolean>('open', { default: false });

const onUpdated = () => {
  open.value = false;
  isMobileSheetOpen.value = false;
};
</script>

<template>
  <ResponsiveDialog v-model:open="open">
    <template #title>{{ $t('common.dialogs.editVehicle') }}</template>
    <EditVehicleForm :vehicle="vehicle" @updated="onUpdated" />
  </ResponsiveDialog>
</template>
