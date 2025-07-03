<script setup lang="ts">
import UiButton from '@/components/lib/ui/button/Button.vue';
import type { HoldingModel } from '@bt/shared/types/investments';
import { ArrowDownIcon, ArrowUpIcon } from 'lucide-vue-next';
import { computed, ref } from 'vue';

const props = defineProps<{ holdings: HoldingModel[]; loading?: boolean; error?: boolean }>();

interface Emit {
  (e: 'edit', holding: HoldingModel): void;
  (e: 'delete', holding: HoldingModel): void;
  (e: 'addTx', holding: HoldingModel): void;
}
const emit = defineEmits<Emit>();

const sortKey = ref<'symbol' | 'quantity' | 'price' | 'value' | 'gain'>('symbol');
const sortDir = ref<'asc' | 'desc'>('asc');

function toggleSort(key: typeof sortKey.value) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortDir.value = 'asc';
  }
}

function getPrice(h: HoldingModel) {
  // TODO: replace with real price once API returns it
  return Number(h.value) / Number(h.quantity || 1);
}

const sortedHoldings = computed(() => {
  if (!props.holdings) return [];
  return [...props.holdings].sort((a, b) => {
    let av: number | string = '',
      bv: number | string = '';
    switch (sortKey.value) {
      case 'symbol':
        av = a.security?.symbol ?? '';
        bv = b.security?.symbol ?? '';
        break;
      case 'quantity':
        av = Number(a.quantity);
        bv = Number(b.quantity);
        break;
      case 'price':
        av = getPrice(a);
        bv = getPrice(b);
        break;
      case 'value':
        av = Number(a.value);
        bv = Number(b.value);
        break;
      case 'gain':
        av = Number(a.value) - Number(a.costBasis);
        bv = Number(b.value) - Number(b.costBasis);
        break;
    }
    if (typeof av === 'string') av = av.toLocaleLowerCase();
    if (typeof bv === 'string') bv = bv.toLocaleLowerCase();
    if (av < bv) return sortDir.value === 'asc' ? -1 : 1;
    if (av > bv) return sortDir.value === 'asc' ? 1 : -1;
    return 0;
  });
});
</script>

<template>
  <div class="relative overflow-x-auto rounded-md border">
    <!-- Loading / Error / Empty states -->
    <div v-if="loading" class="text-muted-foreground py-8 text-center">Loading holdings…</div>
    <div v-else-if="error" class="text-destructive-text py-8 text-center">Failed to load holdings.</div>
    <div v-else-if="!sortedHoldings.length" class="text-muted-foreground py-8 text-center">
      No holdings yet. Click “Add Symbols” to create your first holding.
    </div>

    <table v-else class="divide-border min-w-full divide-y text-sm">
      <thead class="bg-muted/50 text-muted-foreground">
        <tr>
          <th class="px-4 py-2 text-left">
            <button class="flex items-center gap-1" @click="toggleSort('symbol')">
              Symbol
              <ArrowUpIcon v-if="sortKey === 'symbol' && sortDir === 'asc'" class="size-3" />
              <ArrowDownIcon v-if="sortKey === 'symbol' && sortDir === 'desc'" class="size-3" />
            </button>
          </th>
          <th class="px-4 py-2">Name</th>
          <th class="px-4 py-2 text-right">
            <button class="flex items-center gap-1" @click="toggleSort('quantity')">
              Shares
              <ArrowUpIcon v-if="sortKey === 'quantity' && sortDir === 'asc'" class="size-3" />
              <ArrowDownIcon v-if="sortKey === 'quantity' && sortDir === 'desc'" class="size-3" />
            </button>
          </th>
          <th class="px-4 py-2 text-right">Price</th>
          <th class="px-4 py-2 text-right">
            <button class="flex items-center gap-1" @click="toggleSort('value')">
              Market Value
              <ArrowUpIcon v-if="sortKey === 'value' && sortDir === 'asc'" class="size-3" />
              <ArrowDownIcon v-if="sortKey === 'value' && sortDir === 'desc'" class="size-3" />
            </button>
          </th>
          <th class="px-4 py-2 text-right">Gain/Loss</th>
          <th class="px-4 py-2"></th>
        </tr>
      </thead>
      <tbody class="divide-border divide-y">
        <tr v-for="h in sortedHoldings" :key="h.securityId" class="hover:bg-muted/20">
          <td class="px-4 py-2 font-medium">{{ h.security?.symbol }}</td>
          <td class="max-w-[150px] truncate px-4 py-2">{{ h.security?.name }}</td>
          <td class="px-4 py-2 text-right">{{ Number(h.quantity).toLocaleString() }}</td>
          <td class="px-4 py-2 text-right">{{ getPrice(h).toFixed(2) }}</td>
          <td class="px-4 py-2 text-right">{{ Number(h.value).toLocaleString() }}</td>
          <td class="px-4 py-2 text-right">{{ (Number(h.value) - Number(h.costBasis)).toFixed(2) }}</td>
          <td class="px-4 py-1 text-right">
            <UiButton size="sm" variant="ghost" @click="emit('addTx', h)">Add Tx</UiButton>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
/* minimal styling tweaks if needed */
</style>
