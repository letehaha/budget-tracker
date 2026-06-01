<script setup lang="ts">
import { updateVehicle, type VehicleModel } from '@/api/vehicles';
import { VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import {
  DEPRECIATION_PRESET_TRANSLATION_KEYS,
  VEHICLE_CLASS_TRANSLATION_KEYS,
} from '@/common/const/vehicle-classes-verbose';
import InputField from '@/components/fields/input-field.vue';
import SelectField from '@/components/fields/select-field.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { captureException } from '@/lib/sentry';
import { DEPRECIATION_PRESET, VEHICLE_CLASS } from '@bt/shared/types';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { computed, reactive } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{ vehicle: VehicleModel }>();
const emit = defineEmits<{ updated: [] }>();

const { t } = useI18n();
const queryClient = useQueryClient();
const { addNotification } = useNotificationCenter();

interface FormState {
  name: string;
  make: string;
  model: string;
  trim: string;
  year: number;
  vehicleClass: VEHICLE_CLASS;
  depreciationPreset: DEPRECIATION_PRESET;
  customAnnualRatePct: number | null;
  salvageFloorPct: number;
  currentMileage: number | null;
}

const form = reactive<FormState>({
  name: props.vehicle.account?.name ?? `${props.vehicle.make} ${props.vehicle.model}`,
  make: props.vehicle.make,
  model: props.vehicle.model,
  trim: props.vehicle.trim ?? '',
  year: props.vehicle.year,
  vehicleClass: props.vehicle.vehicleClass,
  depreciationPreset: props.vehicle.depreciationPreset,
  customAnnualRatePct: props.vehicle.customAnnualRatePct,
  salvageFloorPct: props.vehicle.salvageFloorPct,
  currentMileage: props.vehicle.currentMileage,
});

const vehicleClassOptions = computed(() =>
  Object.values(VEHICLE_CLASS).map((value) => ({
    label: t(VEHICLE_CLASS_TRANSLATION_KEYS[value]),
    value,
  })),
);

const depreciationPresetOptions = computed(() =>
  Object.values(DEPRECIATION_PRESET).map((value) => ({
    label: t(DEPRECIATION_PRESET_TRANSLATION_KEYS[value]),
    value,
  })),
);

const selectedVehicleClass = computed(
  () => vehicleClassOptions.value.find((o) => o.value === form.vehicleClass) ?? null,
);

const selectedDepreciationPreset = computed(
  () => depreciationPresetOptions.value.find((o) => o.value === form.depreciationPreset) ?? null,
);

const showCustomRate = computed(() => form.depreciationPreset === DEPRECIATION_PRESET.custom);

const updateMutation = useMutation({ mutationFn: updateVehicle });

const submit = async () => {
  if (updateMutation.isPending.value) return;

  try {
    await updateMutation.mutateAsync({
      id: props.vehicle.id,
      payload: {
        name: form.name,
        make: form.make,
        model: form.model,
        trim: form.trim || null,
        year: form.year,
        vehicleClass: form.vehicleClass,
        depreciationPreset: form.depreciationPreset,
        customAnnualRatePct: form.depreciationPreset === DEPRECIATION_PRESET.custom ? form.customAnnualRatePct : null,
        salvageFloorPct: form.salvageFloorPct,
        currentMileage: form.currentMileage,
      },
    });

    addNotification({
      text: t('forms.editVehicle.notifications.success'),
      type: NotificationType.success,
    });

    // Vehicle cache keys are prefixed with `transactionChange`, so the
    // predicate invalidation also covers vehiclesList + vehicleDetail.
    queryClient.invalidateQueries({
      predicate: (q) => (q.queryKey as string[]).includes(VUE_QUERY_GLOBAL_PREFIXES.transactionChange),
    });

    emit('updated');
  } catch (error) {
    addNotification({
      text: t('forms.editVehicle.notifications.error'),
      type: NotificationType.error,
    });
    captureException({ error, context: { source: 'editVehicleForm', vehicleId: props.vehicle.id } });
  }
};
</script>

<template>
  <form class="grid gap-6" @submit.prevent="submit">
    <input-field v-model="form.name" :label="$t('forms.createVehicle.nameLabel')" />

    <div class="grid grid-cols-2 gap-4">
      <input-field v-model="form.make" :label="$t('forms.createVehicle.makeLabel')" />
      <input-field v-model="form.model" :label="$t('forms.createVehicle.modelLabel')" />
    </div>

    <div class="grid grid-cols-2 gap-4">
      <input-field v-model="form.trim" :label="$t('forms.createVehicle.trimLabel')" />
      <input-field v-model="form.year" type="number" :label="$t('forms.createVehicle.yearLabel')" />
    </div>

    <SelectField
      :model-value="selectedVehicleClass"
      :values="vehicleClassOptions"
      label-key="label"
      value-key="value"
      :label="$t('forms.createVehicle.vehicleClassLabel')"
      @update:model-value="(v) => v && (form.vehicleClass = v.value)"
    />

    <SelectField
      :model-value="selectedDepreciationPreset"
      :values="depreciationPresetOptions"
      label-key="label"
      value-key="value"
      :label="$t('forms.createVehicle.depreciationPresetLabel')"
      @update:model-value="(v) => v && (form.depreciationPreset = v.value)"
    />

    <input-field
      v-if="showCustomRate"
      v-model="form.customAnnualRatePct"
      type="number"
      :label="$t('forms.createVehicle.customAnnualRatePctLabel')"
    />

    <input-field v-model="form.salvageFloorPct" type="number" :label="$t('forms.createVehicle.salvageFloorPctLabel')" />

    <input-field
      v-model="form.currentMileage"
      type="number"
      :label="$t('forms.createVehicle.currentMileageLabel')"
      :placeholder="$t('forms.createVehicle.currentMileagePlaceholder')"
    />

    <div class="flex">
      <ui-button type="submit" class="ml-auto min-w-30" :disabled="updateMutation.isPending.value">
        {{
          updateMutation.isPending.value
            ? $t('forms.editVehicle.submitButtonLoading')
            : $t('forms.editVehicle.submitButton')
        }}
      </ui-button>
    </div>
  </form>
</template>
