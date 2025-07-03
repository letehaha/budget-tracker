<template>
  <Card>
    <CardHeader class="flex flex-row items-center justify-between">
      <CardTitle>Holdings</CardTitle>

      <AddSymbolsDialog :portfolio-id="portfolioId" @updated="invalidate">
        <UiButton size="sm">Add Symbol</UiButton>
      </AddSymbolsDialog>
    </CardHeader>
    <CardContent>
      <HoldingsTable :holdings="holdings || []" :loading="isLoading" :error="!!error" @addTx="onAddTx" />
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import AddSymbolsDialog from '@/components/dialogs/add-symbols-dialog.vue';
import HoldingsTable from '@/components/holdings/holdings-table.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/lib/ui/card';
import { useHoldings } from '@/composable/data-queries/holdings';
import { toRef } from 'vue';

const props = defineProps<{ portfolioId: number }>();
const portfolioId = toRef(props, 'portfolioId');

const { data: holdings, isLoading, error, invalidate } = useHoldings(portfolioId);

function onAddTx() {
  // Placeholder – quick transaction feature deferred
}
</script>
