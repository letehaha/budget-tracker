<script setup lang="ts">
import DeleteInvestmentTransactionDialog from '@/components/dialogs/delete-investment-transaction-dialog.vue';
import { Button } from '@/components/lib/ui/button';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { useFormatCurrency } from '@/composable/formatters';
import { useCurrenciesStore } from '@/stores/currencies';
import { InvestmentTransactionModel } from '@bt/shared/types';
import { format } from 'date-fns';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';

const props = defineProps<{
  transactions: InvestmentTransactionModel[];
  total: number;
  limit: number;
  page: number;
}>();

const emit = defineEmits(['page-change', 'add-transaction']);

const { currencies } = storeToRefs(useCurrenciesStore());
const currencyCodeToIdMap = computed(() => {
  if (!currencies.value) return {};
  return currencies.value.reduce(
    (acc, currency) => {
      acc[currency.currency.code] = currency.currencyId;
      return acc;
    },
    {} as Record<string, number>,
  );
});

const getCurrencyIdByCode = (code: string) => currencyCodeToIdMap.value[code];

const { formatAmountByCurrencyId } = useFormatCurrency();
const formatDate = (date: string) => format(new Date(date), 'dd/MM/yyyy');
</script>

<template>
  <div class="bg-muted/20 p-4">
    <div class="mb-2 flex items-center justify-between">
      <h4 class="text-lg font-semibold">Transactions</h4>
      <Button variant="secondary" @click="emit('add-transaction')"> Add transaction </Button>
    </div>
    <div>
      <table class="min-w-full text-sm">
        <thead class="bg-muted/50 text-muted-foreground sticky top-0">
          <tr>
            <th class="px-3 py-2 text-left">Date</th>
            <th class="px-3 py-2 text-left">Type</th>
            <th class="px-3 py-2 text-right">Quantity</th>
            <th class="px-3 py-2 text-right">Price</th>
            <th class="px-3 py-2 text-right">Fees</th>
            <th class="px-3 py-2 text-right">Amount</th>
            <th class="px-3 py-2 text-center">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-border divide-y">
          <tr v-for="tx in props.transactions" :key="tx.id">
            <td class="px-3 py-2">{{ formatDate(tx.date) }}</td>
            <td class="px-3 py-2 capitalize">{{ tx.category }}</td>
            <td class="px-3 py-2 text-right">{{ parseFloat(tx.quantity).toFixed(2) }}</td>
            <td class="px-3 py-2 text-right">
              {{ formatAmountByCurrencyId(parseFloat(tx.price), getCurrencyIdByCode(tx.security.currencyCode)) }}
            </td>
            <td class="px-3 py-2 text-right">
              {{ formatAmountByCurrencyId(parseFloat(tx.fees), getCurrencyIdByCode(tx.security.currencyCode)) }}
            </td>
            <td class="px-3 py-2 text-right">
              {{ formatAmountByCurrencyId(parseFloat(tx.amount), getCurrencyIdByCode(tx.security.currencyCode)) }}
            </td>
            <td class="px-3 py-2 text-center">
              <DeleteInvestmentTransactionDialog :transaction-id="tx.id">
                <UiButton variant="destructive" size="sm"> Delete </UiButton>
              </DeleteInvestmentTransactionDialog>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
