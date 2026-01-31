<script setup lang="ts">
import DeleteInvestmentTransactionDialog from '@/components/dialogs/delete-investment-transaction-dialog.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { useFormatCurrency } from '@/composable/formatters';
import type { InvestmentTransactionModel } from '@bt/shared/types';
import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { format } from 'date-fns';
import { PlusIcon, Trash2Icon } from 'lucide-vue-next';

const props = defineProps<{
  transactions: InvestmentTransactionModel[];
  total: number;
  limit: number;
  page: number;
}>();

const emit = defineEmits(['page-change', 'add-transaction']);
const { formatAmountByCurrencyCode } = useFormatCurrency();
const formatDate = (date: string) => format(new Date(date), 'dd/MM/yyyy');

const getCategoryClasses = (category: INVESTMENT_TRANSACTION_CATEGORY) => {
  const map: Record<INVESTMENT_TRANSACTION_CATEGORY, string> = {
    [INVESTMENT_TRANSACTION_CATEGORY.buy]: 'bg-green-500/10 text-green-600',
    [INVESTMENT_TRANSACTION_CATEGORY.sell]: 'bg-red-500/10 text-red-600',
    [INVESTMENT_TRANSACTION_CATEGORY.dividend]: 'bg-blue-500/10 text-blue-600',
    [INVESTMENT_TRANSACTION_CATEGORY.transfer]: 'bg-amber-500/10 text-amber-600',
    [INVESTMENT_TRANSACTION_CATEGORY.tax]: 'bg-slate-500/10 text-slate-600',
    [INVESTMENT_TRANSACTION_CATEGORY.fee]: 'bg-orange-500/10 text-orange-600',
    [INVESTMENT_TRANSACTION_CATEGORY.cancel]: 'bg-gray-500/10 text-gray-600',
    [INVESTMENT_TRANSACTION_CATEGORY.other]: 'bg-slate-500/10 text-slate-600',
  };
  return map[category] ?? 'bg-slate-500/10 text-slate-600';
};
</script>

<template>
  <div class="p-4">
    <div class="mb-3 flex items-center justify-between">
      <h4 class="text-sm font-semibold">{{ $t('portfolioDetail.transactionsList.title') }}</h4>
      <UiButton variant="outline" size="sm" @click="emit('add-transaction')">
        <PlusIcon class="mr-1.5 size-3.5" />
        {{ $t('portfolioDetail.transactionsList.addButton') }}
      </UiButton>
    </div>
    <table class="w-full text-sm">
      <thead class="bg-muted text-muted-foreground">
        <tr class="text-xs font-medium tracking-wider uppercase">
          <th class="px-3 py-2 text-left">{{ $t('portfolioDetail.transactionsList.headers.date') }}</th>
          <th class="px-3 py-2 text-left">{{ $t('portfolioDetail.transactionsList.headers.type') }}</th>
          <th class="px-3 py-2 text-right">{{ $t('portfolioDetail.transactionsList.headers.quantity') }}</th>
          <th class="px-3 py-2 text-right">{{ $t('portfolioDetail.transactionsList.headers.price') }}</th>
          <th class="px-3 py-2 text-right">{{ $t('portfolioDetail.transactionsList.headers.fees') }}</th>
          <th class="px-3 py-2 text-right">{{ $t('portfolioDetail.transactionsList.headers.amount') }}</th>
          <th class="w-10 px-3 py-2"></th>
        </tr>
      </thead>
      <tbody class="divide-border divide-y">
        <tr v-for="tx in props.transactions" :key="tx.id" class="hover:bg-muted/30 transition-colors">
          <td class="px-3 py-1.5 tabular-nums">{{ formatDate(tx.date) }}</td>
          <td class="px-3 py-1.5">
            <span
              :class="getCategoryClasses(tx.category)"
              class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize"
            >
              {{ $t(`portfolioDetail.transactionsList.categories.${tx.category}`) }}
            </span>
          </td>
          <td class="px-3 py-1.5 text-right tabular-nums">{{ parseFloat(tx.quantity).toFixed(2) }}</td>
          <td class="px-3 py-1.5 text-right tabular-nums">
            {{ formatAmountByCurrencyCode(parseFloat(tx.price), tx.security.currencyCode) }}
          </td>
          <td class="px-3 py-1.5 text-right tabular-nums">
            {{ formatAmountByCurrencyCode(parseFloat(tx.fees), tx.security.currencyCode) }}
          </td>
          <td class="px-3 py-1.5 text-right font-medium tabular-nums">
            {{ formatAmountByCurrencyCode(parseFloat(tx.amount), tx.security.currencyCode) }}
          </td>
          <td class="px-3 py-1.5 text-center">
            <DeleteInvestmentTransactionDialog :transaction-id="tx.id">
              <UiButton variant="ghost-destructive" size="icon" class="size-7">
                <Trash2Icon class="size-3.5" />
              </UiButton>
            </DeleteInvestmentTransactionDialog>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
