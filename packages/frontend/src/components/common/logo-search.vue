<script setup lang="ts">
import { getServiceLogoUrl } from '@/common/utils/logo-url';
import AsyncLogo from '@/components/common/async-logo.vue';
import { Button } from '@/components/lib/ui/button';
import { ScrollArea } from '@/components/lib/ui/scroll-area';
import {
  type BrandLogoSearchResult,
  LOGO_SEARCH_MIN_QUERY_LENGTH,
  useSearchBrandLogo,
} from '@/composable/data-queries/brand-logos';
import { cn } from '@/lib/utils';
import { AlertCircleIcon, CheckIcon, SearchIcon } from '@lucide/vue';
import { useDebounce } from '@vueuse/core';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  /** Currently selected logo domain (null = none). Highlights the matching row. */
  modelValue: string | null;
  /** Seeds the search field so the panel opens already showing matches for the entity. */
  nameForSearch: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const { t } = useI18n({ useScope: 'global' });

// Brand search waits this long after the last keystroke before firing, so a
// fast typist produces one request per word rather than one per character.
const SEARCH_DEBOUNCE_MS = 300;

// Panel re-mounts on each open so the query always starts fresh from the current name.
const searchQuery = ref(props.nameForSearch);
const debounced = useDebounce(searchQuery, SEARCH_DEBOUNCE_MS);

const trimmedQuery = computed(() => searchQuery.value.trim());
const debouncedQuery = computed(() => debounced.value.trim());
// True between a keystroke and the debounce settling – used to keep the panel in
// its "searching" state during that window instead of flashing "no results".
const isTyping = computed(() => trimmedQuery.value !== debouncedQuery.value);

const { results: brandResults, isFetching, isError } = useSearchBrandLogo({ q: debouncedQuery });

// A trimmed query that looks like a bare domain (has a dot, no spaces, no
// slashes – e.g. "amazon.com"). logo.dev always returns a 200 monogram for any
// domain, so the user can pick one directly even when the brand search misses.
const DOMAIN_SHAPE = /^[^\s/]+\.[^\s/]+$/;

const syntheticDomainResult = computed<BrandLogoSearchResult | null>(() => {
  const q = trimmedQuery.value;
  if (!DOMAIN_SHAPE.test(q)) return null;
  return {
    name: t('common.logo.useDomainDirectly', { domain: q }),
    domain: q,
    logoUrl: getServiceLogoUrl({ domain: q }),
  };
});

// The typed domain sits on top, followed by the brand-search hits with any
// duplicate of the synthetic domain removed so it never appears twice.
const displayedResults = computed<BrandLogoSearchResult[]>(() => {
  const synthetic = syntheticDomainResult.value;
  if (!synthetic) return brandResults.value;
  return [synthetic, ...brandResults.value.filter((result) => result.domain !== synthetic.domain)];
});

const hasResults = computed(() => displayedResults.value.length > 0);
// Spans the debounce gap and in-flight request, but only once the query is long enough to fire.
const isSearching = computed(
  () => trimmedQuery.value.length >= LOGO_SEARCH_MIN_QUERY_LENGTH && (isTyping.value || isFetching.value),
);

// A bare domain query yields the synthetic row, so the "type more" hint only
// applies to short, non-domain fragments.
const showTypePrompt = computed(
  () => !syntheticDomainResult.value && trimmedQuery.value.length < LOGO_SEARCH_MIN_QUERY_LENGTH,
);
// Skeleton only on first search; refetches keep existing rows visible to avoid flicker.
const showSkeleton = computed(() => isSearching.value && !hasResults.value);
// Checked before showNoResults so a failed query doesn't surface the "no brand matched" copy.
const showError = computed(() => isError.value && !isSearching.value);
const showNoResults = computed(
  () => !isError.value && !isSearching.value && !showTypePrompt.value && !hasResults.value,
);

const SKELETON_ROW_COUNT = 4;

function handlePick({ domain }: BrandLogoSearchResult) {
  emit('update:modelValue', domain);
}

function selectAllOnFocus(event: FocusEvent) {
  (event.target as HTMLInputElement).select();
}
</script>

<template>
  <div class="flex flex-col">
    <div class="border-input border-b p-2">
      <div class="relative">
        <SearchIcon class="text-muted-foreground absolute top-1/2 left-2 size-4 -translate-y-1/2" />
        <!-- NOTE: raw <input> used here instead of InputField because this search
             box lives inside a popover panel – no label, no error display, needs
             a custom leading icon slot and a @focus handler that InputField does
             not natively support without a full wrapper rewrite. -->
        <input
          v-model="searchQuery"
          type="text"
          class="border-input bg-input-background focus-visible:ring-ring h-9 w-full rounded-md border pr-2 pl-8 text-sm focus-visible:ring-2 focus-visible:outline-hidden"
          :placeholder="$t('common.logo.searchPlaceholder')"
          data-test="logo-search-input"
          @focus="selectAllOnFocus"
        />
      </div>
    </div>

    <!-- Prompt: query still too short to search and not a domain. -->
    <div v-if="showTypePrompt" class="text-muted-foreground flex flex-col items-center gap-1.5 px-4 py-6 text-center">
      <SearchIcon class="size-5" />
      <p class="text-sm">{{ $t('common.logo.searchHint') }}</p>
    </div>

    <!-- First-search skeletons. -->
    <div v-else-if="showSkeleton" class="flex flex-col gap-1 p-1.5">
      <div v-for="row in SKELETON_ROW_COUNT" :key="row" class="flex items-center gap-3 px-3 py-2">
        <div class="bg-muted size-8 shrink-0 animate-pulse rounded-lg" />
        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
          <div class="bg-muted h-3 w-2/5 animate-pulse rounded" />
          <div class="bg-muted h-2.5 w-3/5 animate-pulse rounded" />
        </div>
      </div>
    </div>

    <!-- Error state: distinct from no-results so the user knows to retry, not rephrase. -->
    <div v-else-if="showError" class="text-muted-foreground flex flex-col items-center gap-1.5 px-4 py-6 text-center">
      <AlertCircleIcon class="text-destructive-text size-5" />
      <p class="text-sm">{{ $t('common.logo.searchError') }}</p>
    </div>

    <!-- No brand matched the search. -->
    <div
      v-else-if="showNoResults"
      class="text-muted-foreground flex flex-col items-center gap-1.5 px-4 py-6 text-center"
    >
      <SearchIcon class="size-5" />
      <p class="text-sm">{{ $t('common.logo.noResults') }}</p>
    </div>

    <ScrollArea v-else class="max-h-72">
      <div class="flex flex-col gap-1 p-1.5" role="listbox">
        <Button
          v-for="result in displayedResults"
          :key="result.domain"
          variant="ghost"
          role="option"
          :aria-selected="result.domain === modelValue"
          :class="
            cn(
              'h-auto w-full justify-start gap-3 rounded-md px-3 py-2 text-left',
              result.domain === modelValue && 'bg-primary/10 hover:bg-primary/15',
            )
          "
          @click="handlePick(result)"
        >
          <AsyncLogo :url="result.logoUrl" :alt="result.name" class="size-8 shrink-0 rounded-lg" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">{{ result.name }}</p>
            <p class="text-muted-foreground truncate text-xs">{{ result.domain }}</p>
          </div>
          <CheckIcon v-if="result.domain === modelValue" class="text-primary size-4 shrink-0" />
        </Button>
      </div>
    </ScrollArea>
  </div>
</template>
