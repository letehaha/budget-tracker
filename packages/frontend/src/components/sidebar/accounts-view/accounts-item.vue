<script setup lang="ts">
import Button from '@/components/lib/ui/button/Button.vue';
import { useFormatCurrency } from '@/composable';
import { ROUTES_NAMES } from '@/routes';
import { AccountModel } from '@bt/shared/types';

defineProps<{
  account: AccountModel;
}>();

const { formatAmountByCurrencyId } = useFormatCurrency();
</script>

<template>
  <router-link
    v-slot="{ isActive }"
    :to="{ name: ROUTES_NAMES.account, params: { id: account.id } }"
    class="flex w-full"
  >
    <Button :variant="isActive ? 'secondary' : 'ghost'" as="div" size="default" class="w-full h-[56px]">
      <div class="flex justify-between items-center w-full">
        <div class="flex flex-col gap-1">
          <span class="text-sm">{{ account.name }}</span>
          <span class="text-xs">
            {{ account.accountCategory }}
          </span>
        </div>
        <div class="text-sm">
          {{ formatAmountByCurrencyId(account.currentBalance, account.currencyId) }}
        </div>
      </div>
    </Button>
  </router-link>
</template>
