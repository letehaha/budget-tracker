<template>
  <Card>
    <CardHeader>
      <div class="flex flex-row items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <CardTitle>Holdings</CardTitle>
          <div class="relative w-64">
            <input
              v-model="filterText"
              type="text"
              placeholder="Filter by symbol or name..."
              class="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            />
            <button
              v-if="filterText"
              @click="filterText = ''"
              class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
            >
              <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <AddSymbolsDialog :portfolio-id="portfolioId" @updated="invalidate">
          <UiButton size="sm">Add Symbol</UiButton>
        </AddSymbolsDialog>
      </div>
    </CardHeader>
    <CardContent>
      <HoldingsTable
        :holdings="filteredHoldings || []"
        :loading="isLoading"
        :error="!!error"
        :portfolio-id="portfolioId"
      />
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import AddSymbolsDialog from '@/components/dialogs/add-symbols-dialog.vue';
import HoldingsTable from '@/components/holdings/holdings-table.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/lib/ui/card';
import { useHoldings } from '@/composable/data-queries/holdings';
import { computed, ref, toRef } from 'vue';

const props = defineProps<{ portfolioId: number }>();
const portfolioId = toRef(props, 'portfolioId');

const { data: holdings, isLoading, error, invalidate } = useHoldings(portfolioId);

const filterText = ref('');

const filteredHoldings = computed(() => {
  if (!holdings.value) return null;
  if (!filterText.value.trim()) return holdings.value;

  const searchTerm = filterText.value.toLowerCase().trim();
  return holdings.value.filter((holding) => {
    const symbol = holding.security?.symbol?.toLowerCase() || '';
    const name = holding.security?.name?.toLowerCase() || '';
    return symbol.includes(searchTerm) || name.includes(searchTerm);
  });
});
</script>
