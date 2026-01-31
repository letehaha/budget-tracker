<template>
  <Card>
    <CardHeader class="pb-4">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex items-center gap-3">
          <div class="bg-primary/10 flex size-9 items-center justify-center rounded-lg">
            <LayoutListIcon class="text-primary size-5" />
          </div>
          <div>
            <CardTitle class="text-lg">{{ $t('portfolioDetail.holdings.title') }}</CardTitle>
            <p v-if="holdings" class="text-muted-foreground text-sm">
              {{ $t('portfolioDetail.holdings.subtitle', { count: holdings.length }) }}
            </p>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <!-- Search Filter -->
          <div class="relative flex-1 sm:w-64">
            <SearchIcon class="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <input
              v-model="filterText"
              type="text"
              :placeholder="$t('portfolioDetail.holdings.filterPlaceholder')"
              class="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring h-9 w-full rounded-md border pr-8 pl-9 text-sm focus-visible:ring-1 focus-visible:outline-none"
            />
            <button
              v-if="filterText"
              @click="filterText = ''"
              class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
            >
              <XIcon class="size-4" />
            </button>
          </div>

          <AddSymbolsDialog :portfolio-id="portfolioId" @updated="invalidate">
            <UiButton size="sm">
              <PlusIcon class="mr-1 size-4" />
              {{ $t('portfolioDetail.holdings.addButton') }}
            </UiButton>
          </AddSymbolsDialog>
        </div>
      </div>
    </CardHeader>
    <CardContent class="pt-0">
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
import { LayoutListIcon, PlusIcon, SearchIcon, XIcon } from 'lucide-vue-next';
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
