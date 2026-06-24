import { type BrandLogoSearchResult, searchBrandLogo } from '@/api/brand-logos';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { QUERY_CACHE_STALE_TIME } from '@/common/const/vue-query';
import { useQuery } from '@tanstack/vue-query';
import { type MaybeRefOrGetter, computed, toValue } from 'vue';

/**
 * Shortest query that triggers a brand search. One- or two-character fragments
 * match too many brands to be useful and would burn the per-user rate budget on
 * every keystroke, so the search stays disabled until the user types this much.
 */
export const LOGO_SEARCH_MIN_QUERY_LENGTH = 2;

/**
 * Live brand-logo search keyed by the (debounced) query. Cached per term so
 * backspacing to an already-searched query is instant and never re-hits the
 * logo.dev quota. Stays disabled below `LOGO_SEARCH_MIN_QUERY_LENGTH` so a fresh
 * field or a single stray character makes no request. The caller is responsible
 * for debouncing `q` before passing it in. Shared by the payee and subscription
 * logo pickers.
 */
export const useSearchBrandLogo = ({
  q,
  enabled,
}: {
  q: MaybeRefOrGetter<string>;
  enabled?: MaybeRefOrGetter<boolean>;
}) => {
  const trimmed = computed(() => toValue(q).trim());
  const query = useQuery({
    queryKey: computed(() => [...VUE_QUERY_CACHE_KEYS.brandLogoSearch, trimmed.value] as const),
    queryFn: () => searchBrandLogo({ q: trimmed.value }),
    enabled: computed(() => {
      const flag = enabled === undefined ? true : toValue(enabled);
      return flag && trimmed.value.length >= LOGO_SEARCH_MIN_QUERY_LENGTH;
    }),
    staleTime: QUERY_CACHE_STALE_TIME.ANALYTICS,
  });

  const results = computed<BrandLogoSearchResult[]>(() => query.data.value?.results ?? []);

  return { ...query, results };
};

export type { BrandLogoSearchResult };
