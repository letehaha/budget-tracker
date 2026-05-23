<script setup lang="ts">
import { searchSecurities } from '@/api/securities';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { InputField } from '@/components/fields';
import { Button } from '@/components/lib/ui/button';
import * as Popover from '@/components/lib/ui/popover';
import { ScrollArea } from '@/components/lib/ui/scroll-area';
import { ASSET_CLASS, type ResolvedSecurityRef, type SecuritySearchResult } from '@bt/shared/types/investments';
import { useQuery } from '@tanstack/vue-query';
import { ChevronDownIcon, SearchIcon } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';

const SEARCH_DEBOUNCE_MS = 250;

const props = defineProps<{
  modelValue: ResolvedSecurityRef | null;
  /** Securities already selected on OTHER holding rows. Disables them in the dropdown. */
  blockedProviderSymbols: string[];
  /** Crypto / stocks — narrows the provider search. */
  assetClass: ASSET_CLASS;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: ResolvedSecurityRef | null): void;
}>();

const isOpen = ref(false);
const searchTerm = ref('');
const debounced = ref('');

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
watch(searchTerm, (v) => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounced.value = v.trim();
  }, SEARCH_DEBOUNCE_MS);
});

const blockedSet = computed(() => new Set(props.blockedProviderSymbols));

const query = useQuery({
  queryKey: computed(
    () => [...VUE_QUERY_CACHE_KEYS.investmentImportSecuritySearch, debounced.value, props.assetClass] as const,
  ),
  queryFn: () => searchSecurities({ query: debounced.value, assetClass: props.assetClass }),
  enabled: () => debounced.value.length >= 1,
});

function pickResult(result: SecuritySearchResult) {
  emit('update:modelValue', {
    securityId: null,
    providerSymbol: result.providerSymbol,
    symbol: result.symbol,
    name: result.name,
    alreadyInDb: false,
  });
  isOpen.value = false;
  searchTerm.value = '';
  debounced.value = '';
}

const buttonLabel = computed(() => {
  if (!props.modelValue) return '';
  return `${props.modelValue.symbol} — ${props.modelValue.name}`;
});

const hasResults = computed(() => (query.data.value ?? []).length > 0);
</script>

<template>
  <Popover.Popover v-model:open="isOpen">
    <Popover.PopoverTrigger as-child>
      <Button
        type="button"
        variant="outline"
        :class="[
          'group inline-flex w-full items-center justify-between gap-2 text-left font-normal',
          modelValue ? '' : 'border-destructive-text',
        ]"
      >
        <span v-if="modelValue" class="truncate font-medium">{{ buttonLabel }}</span>
        <span v-else class="text-destructive-text">{{ $t('investmentsImport.review.pickSecurity') }}</span>
        <ChevronDownIcon class="text-muted-foreground size-4 shrink-0 transition group-data-[state=open]:rotate-180" />
      </Button>
    </Popover.PopoverTrigger>

    <Popover.PopoverContent class="w-[360px] p-0" align="start">
      <div class="border-b p-2">
        <InputField
          v-model="searchTerm"
          type="text"
          :placeholder="$t('investmentsImport.review.searchPlaceholder')"
          autofocus
          leading-icon-css-class="px-3"
        >
          <template #iconLeading>
            <SearchIcon class="text-muted-foreground size-4" />
          </template>
        </InputField>
      </div>

      <ScrollArea class="max-h-[280px]">
        <div v-if="query.isFetching.value" class="text-muted-foreground p-3 text-center text-xs">
          {{ $t('investmentsImport.review.searching') }}
        </div>
        <div v-else-if="!debounced" class="text-muted-foreground p-3 text-center text-xs">
          {{ $t('investmentsImport.review.startTyping') }}
        </div>
        <div v-else-if="!hasResults" class="text-muted-foreground p-3 text-center text-xs">
          {{ $t('investmentsImport.review.noResults') }}
        </div>
        <ul v-else class="py-1">
          <li v-for="r in query.data.value" :key="`${r.providerName}:${r.providerSymbol}`">
            <Button
              type="button"
              variant="ghost"
              :disabled="blockedSet.has(r.providerSymbol)"
              class="flex h-auto w-full items-center justify-between gap-2 rounded-none px-3 py-2 text-left font-normal"
              @click="pickResult(r)"
            >
              <span class="min-w-0 flex-1">
                <span class="font-medium">{{ r.symbol }}</span>
                <span class="text-muted-foreground ml-2 truncate text-xs">{{ r.name }}</span>
              </span>
              <span v-if="blockedSet.has(r.providerSymbol)" class="text-muted-foreground text-[10px]">
                {{ $t('investmentsImport.review.alreadyPicked') }}
              </span>
            </Button>
          </li>
        </ul>
      </ScrollArea>
    </Popover.PopoverContent>
  </Popover.Popover>
</template>
