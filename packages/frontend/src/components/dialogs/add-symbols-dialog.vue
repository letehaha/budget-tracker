<script setup lang="ts">
import { searchSecurities } from '@/api/securities';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import InputField from '@/components/fields/input-field.vue';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { useCreateHolding } from '@/composable/data-queries/holdings';
import type { SecuritySearchResult } from '@bt/shared/types/investments';
import { useQuery } from '@tanstack/vue-query';
import { computed, ref, watch } from 'vue';

const props = defineProps<{ portfolioId: number }>();
const emit = defineEmits(['updated']);

const isOpen = ref(false);
const searchTerm = ref('');

const debounced = ref('');
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

watch(searchTerm, (v) => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounced.value = v.trim();
  }, 300);
});

const key = computed(() => ['sec-search', debounced.value] as const);

const query = useQuery({
  queryKey: key,
  queryFn: () => searchSecurities(debounced.value),
  enabled: () => debounced.value.length >= 1,
});

const createHolding = useCreateHolding();
const { addNotification } = useNotificationCenter();

async function addSymbol(sec: SecuritySearchResult) {
  try {
    await createHolding.mutateAsync({
      portfolioId: props.portfolioId,
      searchResult: sec,
      quantity: 0,
      costBasis: 0,
    });
    addNotification({ text: 'Holding added.', type: NotificationType.success });
    isOpen.value = false;
    searchTerm.value = '';
    emit('updated');
  } catch {
    addNotification({ text: 'Failed to add holding.', type: NotificationType.error });
  }
}
</script>

<template>
  <ResponsiveDialog v-model:open="isOpen">
    <template #trigger>
      <slot />
    </template>

    <template #title> Add Symbols </template>

    <template #default>
      <div class="grid gap-4">
        <InputField
          v-model="searchTerm"
          label="Search symbol or name"
          placeholder="AAPL"
          class="max-w-[calc(100%-50px)]"
        />

        <div v-if="query.isLoading.value" class="text-muted-foreground text-sm">Searching…</div>
        <div v-else-if="query.error.value" class="text-destructive-text text-sm">Failed to search securities.</div>
        <div v-else>
          <ul class="max-h-60 overflow-y-auto">
            <li
              v-for="sec in query.data.value || []"
              :key="sec.symbol"
              class="hover:bg-muted/40 grid cursor-pointer grid-cols-[auto,1fr,auto,auto] items-center gap-2 px-2 py-1"
              @click="addSymbol(sec)"
            >
              <span class="font-medium">{{ sec.symbol }}</span>

              <span class="text-muted-foreground truncate text-xs">{{ sec.name }}</span>

              <span class="text-muted-foreground text-right text-xs">{{ sec.exchangeName }}</span>

              <span class="text-muted-foreground text-right text-xs">{{ sec.currencyCode.toUpperCase() }}</span>
            </li>
          </ul>
          <div v-if="debounced && (query.data.value?.length ?? 0) === 0" class="text-muted-foreground text-sm">
            No results.
          </div>
        </div>
      </div>
    </template>
  </ResponsiveDialog>
</template>
