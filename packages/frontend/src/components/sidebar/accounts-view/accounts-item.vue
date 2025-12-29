<script setup lang="ts">
import Button from '@/components/lib/ui/button/Button.vue';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { useFormatCurrency } from '@/composable';
import { ROUTES_NAMES } from '@/routes';
import { AccountModel } from '@bt/shared/types';

defineProps<{
  account: AccountModel;
}>();

const { formatCompactAmount, formatAmountByCurrencyCode } = useFormatCurrency();
</script>

<template>
  <router-link
    v-slot="{ isActive }"
    :to="{ name: ROUTES_NAMES.account, params: { id: account.id } }"
    class="flex w-full"
  >
    <Button :variant="isActive ? 'secondary' : 'ghost'" as="div" size="default" class="h-auto w-full px-2">
      <div class="flex w-full items-center justify-between gap-x-2">
        <span class="truncate text-sm">{{ account.name }}</span>
        <DesktopOnlyTooltip :content="formatAmountByCurrencyCode(account.currentBalance, account.currencyCode)">
          <span
            class="shrink-0 text-sm tabular-nums"
            :class="account.currentBalance >= 0 ? 'text-muted-foreground' : 'text-destructive-text'"
          >
            {{ formatCompactAmount(account.currentBalance, account.currencyCode) }}
          </span>
        </DesktopOnlyTooltip>
      </div>
    </Button>
  </router-link>
</template>
