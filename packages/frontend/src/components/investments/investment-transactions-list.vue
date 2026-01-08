<script setup lang="ts">
import DeleteInvestmentTransactionDialog from '@/components/dialogs/delete-investment-transaction-dialog.vue';
import { Button } from '@/components/lib/ui/button';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { useFormatCurrency } from '@/composable/formatters';
import { InvestmentTransactionModel } from '@bt/shared/types';
import { format } from 'date-fns';

const props = defineProps<{
  transactions: InvestmentTransactionModel[];
  total: number;
  limit: number;
  page: number;
}>();

const emit = defineEmits(['page-change', 'add-transaction']);
const { formatAmountByCurrencyCode } = useFormatCurrency();
const formatDate = (date: string) => format(new Date(date), 'dd/MM/yyyy');
</script>

<template>
  <div class="bg-muted/20 p-4">
    <div class="mb-2 flex items-center justify-between">
      <h4 class="text-lg font-semibold">{{ $t('portfolioDetail.transactionsList.title') }}</h4>
      <Button variant="secondary" @click="emit('add-transaction')">
        {{ $t('portfolioDetail.transactionsList.addButton') }}
      </Button>
    </div>
    <div>
      <table class="min-w-full text-sm">
        <thead class="bg-muted/50 text-muted-foreground sticky top-0">
          <tr>
            <th class="px-3 py-2 text-left">{{ $t('portfolioDetail.transactionsList.headers.date') }}</th>
            <th class="px-3 py-2 text-left">{{ $t('portfolioDetail.transactionsList.headers.type') }}</th>
            <th class="px-3 py-2 text-right">{{ $t('portfolioDetail.transactionsList.headers.quantity') }}</th>
            <th class="px-3 py-2 text-right">{{ $t('portfolioDetail.transactionsList.headers.price') }}</th>
            <th class="px-3 py-2 text-right">{{ $t('portfolioDetail.transactionsList.headers.fees') }}</th>
            <th class="px-3 py-2 text-right">{{ $t('portfolioDetail.transactionsList.headers.amount') }}</th>
            <th class="px-3 py-2 text-center">{{ $t('portfolioDetail.transactionsList.headers.actions') }}</th>
          </tr>
        </thead>
        <tbody class="divide-border divide-y">
          <tr v-for="tx in props.transactions" :key="tx.id">
            <td class="px-3 py-2">{{ formatDate(tx.date) }}</td>
            <td class="px-3 py-2 capitalize">{{ tx.category }}</td>
            <td class="px-3 py-2 text-right">{{ parseFloat(tx.quantity).toFixed(2) }}</td>
            <td class="px-3 py-2 text-right">
              {{ formatAmountByCurrencyCode(parseFloat(tx.price), tx.security.currencyCode) }}
            </td>
            <td class="px-3 py-2 text-right">
              {{ formatAmountByCurrencyCode(parseFloat(tx.fees), tx.security.currencyCode) }}
            </td>
            <td class="px-3 py-2 text-right">
              {{ formatAmountByCurrencyCode(parseFloat(tx.amount), tx.security.currencyCode) }}
            </td>
            <td class="px-3 py-2 text-center">
              <DeleteInvestmentTransactionDialog :transaction-id="tx.id">
                <UiButton variant="destructive" size="sm">
                  {{ $t('portfolioDetail.transactionsList.deleteButton') }}
                </UiButton>
              </DeleteInvestmentTransactionDialog>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
