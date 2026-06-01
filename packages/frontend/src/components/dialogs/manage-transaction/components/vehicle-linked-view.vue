<script lang="ts" setup>
import { getVehicles } from '@/api/vehicles';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { Button } from '@/components/lib/ui/button';
import { ROUTES_NAMES } from '@/routes';
import { useAccountsStore } from '@/stores';
import type { TransactionModel } from '@bt/shared/types';
import { useQuery } from '@tanstack/vue-query';
import { storeToRefs } from 'pinia';
import { DialogClose, DialogTitle } from 'reka-ui';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

const props = defineProps<{
  transaction: TransactionModel;
}>();

const emit = defineEmits<{ 'close-modal': [] }>();

const { accountsRecord } = storeToRefs(useAccountsStore());

const accountName = computed(() => accountsRecord.value[props.transaction.accountId]?.name ?? '');

// The tx only carries accountId. Vehicles are a small list per user (typically
// 1–5); query and resolve client-side. Cached under the standard vehiclesList
// key, so this is a no-op when the user has already loaded /accounts.
const { data: vehicles } = useQuery({
  queryKey: VUE_QUERY_CACHE_KEYS.vehiclesList,
  queryFn: getVehicles,
});

const vehicleId = computed(() => vehicles.value?.find((v) => v.accountId === props.transaction.accountId)?.id ?? null);

const ctaRoute = computed(() =>
  vehicleId.value
    ? { name: ROUTES_NAMES.accountsVehicleDetails, params: { id: vehicleId.value } }
    : { name: ROUTES_NAMES.accounts },
);
</script>

<template>
  <div class="rounded-t-xl">
    <div class="bg-app-transfer-color h-3 rounded-t-lg" />
    <div class="mb-4 flex items-center justify-between px-6 py-3">
      <DialogTitle>
        <span class="text-2xl">
          {{ $t('dialogs.manageTransaction.vehicleLinked.title') }}
        </span>
      </DialogTitle>

      <DialogClose>
        <Button variant="ghost" @click="emit('close-modal')">
          {{ $t('dialogs.manageTransaction.form.closeButton') }}
        </Button>
      </DialogClose>
    </div>

    <div class="px-6 pb-6">
      <div class="bg-muted/30 border-border rounded-lg border p-4">
        <p class="text-sm">
          {{ $t('dialogs.manageTransaction.vehicleLinked.description', { name: accountName }) }}
        </p>
        <p class="text-muted-foreground mt-2 text-sm">
          {{ $t('dialogs.manageTransaction.vehicleLinked.editHint') }}
        </p>
      </div>

      <RouterLink :to="ctaRoute" class="block" @click="emit('close-modal')">
        <Button variant="outline" class="mt-4 w-full">
          {{ $t('dialogs.manageTransaction.vehicleLinked.openVehicle', { name: accountName }) }}
        </Button>
      </RouterLink>
    </div>
  </div>
</template>
