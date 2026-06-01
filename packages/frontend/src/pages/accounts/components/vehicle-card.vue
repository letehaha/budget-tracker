<template>
  <router-link
    :to="{
      name: ROUTES_NAMES.accountsVehicleDetails,
      params: { id: vehicle.id },
    }"
    class="hover:bg-accent max-xs:justify-between max-xs:items-center max-xs:gap-5 max-xs:py-2 xs:rounded-lg xs:flex-col relative flex h-full gap-3 border p-4 shadow-xs"
  >
    <div class="flex flex-col gap-1 overflow-hidden">
      <div class="flex items-center gap-4 overflow-hidden">
        <CarIcon class="text-muted-foreground size-5 shrink-0" />
        <div class="xs:max-w-[calc(100%-60px)] truncate text-base tracking-wide whitespace-nowrap">
          {{ vehicle.account?.name || `${vehicle.make} ${vehicle.model}` }}
        </div>
      </div>

      <div class="text-muted-foreground truncate text-xs">
        {{ vehicle.year }} {{ vehicle.make }} {{ vehicle.model }}
      </div>
    </div>

    <div class="xs:text-lg font-semibold whitespace-nowrap">
      {{ formatAmountByCurrencyCode(vehicle.account?.currentBalance ?? 0, vehicle.account?.currencyCode ?? 'USD') }}
    </div>
  </router-link>
</template>

<script setup lang="ts">
import type { VehicleModel } from '@/api/vehicles';
import { useFormatCurrency } from '@/composable';
import { ROUTES_NAMES } from '@/routes/constants';
import { CarIcon } from '@lucide/vue';

defineProps<{ vehicle: VehicleModel }>();

const { formatAmountByCurrencyCode } = useFormatCurrency();
</script>
