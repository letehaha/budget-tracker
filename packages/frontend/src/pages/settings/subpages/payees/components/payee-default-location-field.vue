<template>
  <div class="flex min-w-0 flex-col gap-1.5">
    <label class="text-foreground text-sm font-medium">
      {{ $t('payees.detail.defaultLocationLabel') }}
    </label>
    <div class="flex gap-2 max-sm:flex-col max-sm:justify-start sm:items-center">
      <p class="text-foreground text-sm font-semibold wrap-break-word">
        {{ label || coords || $t('payees.detail.defaultLocationEmpty') }}
      </p>
      <div class="flex gap-2">
        <Button variant="outline" size="sm" :disabled="updateMut.isPending.value" @click="isPickerOpen = true">
          <MapPinIcon class="size-4" />
          {{ $t('dialogs.manageTransaction.form.location.pickOnMap') }}
        </Button>
        <Button
          v-if="defaultLocation"
          variant="soft-destructive"
          size="icon-sm"
          :aria-label="$t('dialogs.manageTransaction.form.location.clear')"
          :disabled="updateMut.isPending.value"
          @click="isClearConfirmOpen = true"
        >
          <XIcon class="size-4" />
        </Button>
      </div>
    </div>
    <p class="text-muted-foreground text-[13px] leading-snug">
      {{ $t('payees.detail.defaultLocationHint') }}
    </p>

    <LocationPickerDialog
      v-model:open="isPickerOpen"
      :latitude="defaultLocation?.latitude"
      :longitude="defaultLocation?.longitude"
      @select="handlePicked"
    />

    <ResponsiveAlertDialog
      v-model:open="isClearConfirmOpen"
      :confirm-label="$t('dialogs.manageTransaction.form.location.clear')"
      confirm-variant="destructive"
      @confirm="save(null)"
    >
      <template #title>{{ $t('payees.detail.clearDefaultLocationTitle') }}</template>
      <template #description>{{ $t('payees.detail.clearDefaultLocationDescription') }}</template>
    </ResponsiveAlertDialog>
  </div>
</template>

<script setup lang="ts">
import { roundCoordinate } from '@/common/utils/coordinates';
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import LocationPickerDialog from '@/components/dialogs/manage-transaction/components/location-picker-dialog.vue';
import { useMapPickerSetting } from '@/components/dialogs/manage-transaction/composables/use-map-picker-setting';
import { useReverseGeocodedLabel } from '@/components/dialogs/manage-transaction/composables/use-reverse-geocoded-label';
import { Button } from '@/components/lib/ui/button';
import { useNotificationCenter } from '@/components/notification-center';
import { useUpdatePayee } from '@/composable/data-queries/payees';
import type { TransactionLocation } from '@bt/shared/types';
import { MapPinIcon, XIcon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  payeeId: string;
  defaultLocation: TransactionLocation | null;
}>();

const { t } = useI18n();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const updateMut = useUpdatePayee();

const isPickerOpen = ref(false);
const isClearConfirmOpen = ref(false);
const { enabled: isMapPickerEnabled } = useMapPickerSetting();
const { label, setKnownLabel } = useReverseGeocodedLabel({
  latitude: computed(() => props.defaultLocation?.latitude),
  longitude: computed(() => props.defaultLocation?.longitude),
  enabled: isMapPickerEnabled,
});
const coords = computed(() =>
  props.defaultLocation ? `${props.defaultLocation.latitude}, ${props.defaultLocation.longitude}` : null,
);

async function save(defaultLocation: TransactionLocation | null) {
  try {
    await updateMut.mutateAsync({ id: props.payeeId, payload: { defaultLocation } });
    addSuccessNotification(t('payees.toasts.updated'));
  } catch {
    addErrorNotification(t('payees.errors.generic'));
  }
}

function handlePicked(picked: { latitude: number; longitude: number; label: string | null }) {
  const rounded = {
    latitude: roundCoordinate({ value: picked.latitude }),
    longitude: roundCoordinate({ value: picked.longitude }),
  };
  setKnownLabel({ ...rounded, label: picked.label });
  save(rounded);
}
</script>
