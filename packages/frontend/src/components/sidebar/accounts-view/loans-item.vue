<script setup lang="ts">
import type { LoanApi } from '@/api/loans';
import Button from '@/components/lib/ui/button/Button.vue';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { useFormatCurrency } from '@/composable/formatters';
import { getLoanTypeIcon } from '@/pages/loans/loan-type-presentation';
import { ROUTES_NAMES } from '@/routes/constants';
import { computed } from 'vue';

const props = defineProps<{
  loan: LoanApi;
}>();

const { formatCompactAmount, formatAmountByCurrencyCode } = useFormatCurrency();

// Loan balances follow the liability convention (negative while debt is owed), so
// the signed balance renders as a red negative — matching how liability accounts
// read in the Bank Accounts list rather than looking like a positive asset.
const balance = computed(() => props.loan.currentBalance);
const loanIcon = computed(() => getLoanTypeIcon({ loanType: props.loan.loanDetails.loanType }));
</script>

<template>
  <router-link
    v-slot="{ isActive }"
    :to="{ name: ROUTES_NAMES.loanDetail, params: { id: loan.id } }"
    class="flex w-full"
  >
    <Button :variant="isActive ? 'secondary' : 'ghost'" as="div" size="default" class="h-auto w-full px-2">
      <div class="flex w-full items-center justify-between gap-x-2">
        <div class="flex min-w-0 items-center gap-1.5">
          <component :is="loanIcon" class="text-muted-foreground size-3.5 shrink-0" />
          <span class="truncate text-sm">{{ loan.name }}</span>
        </div>
        <DesktopOnlyTooltip :content="formatAmountByCurrencyCode(balance, loan.currencyCode)">
          <span
            class="text-amount shrink-0 text-sm"
            :class="balance >= 0 ? 'text-muted-foreground' : 'text-destructive-text'"
          >
            {{ formatCompactAmount(balance, loan.currencyCode) }}
          </span>
        </DesktopOnlyTooltip>
      </div>
    </Button>
  </router-link>
</template>
