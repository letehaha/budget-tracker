import {
  CreatePayeePayload,
  IgnoredName,
  PayeeSortBy,
  PayeeSortDir,
  PayeeWithStats,
  UpdatePayeePayload,
  addIgnoredName,
  applyPayeeTagsToExisting,
  bulkUpdateCategorizationMode,
  createPayee,
  createPayeeAlias,
  deletePayee,
  deletePayeeAlias,
  deletePayeeAndIgnore,
  listIgnoredNames,
  loadPayeeById,
  loadPayees,
  loadPayeesByAccount,
  mergePayees,
  removeIgnoredName,
  resetPayeeLogo,
  updatePayee,
} from '@/api/payees';
import { VUE_QUERY_CACHE_KEYS, VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import { QUERY_CACHE_STALE_TIME } from '@/common/const/vue-query';
import { useNotificationCenter } from '@/components/notification-center';
import type { CATEGORIZATION_MODE } from '@bt/shared/types';
import { useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/vue-query';
import { type MaybeRefOrGetter, computed, toValue, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const PAYEES_PAGE_SIZE = 50;

export const usePayees = ({
  q,
  sortBy,
  sortDir,
  enabled,
}: {
  q?: MaybeRefOrGetter<string | undefined>;
  sortBy?: MaybeRefOrGetter<PayeeSortBy | undefined>;
  sortDir?: MaybeRefOrGetter<PayeeSortDir | undefined>;
  enabled?: MaybeRefOrGetter<boolean>;
} = {}) => {
  const query = useQuery({
    queryKey: computed(
      () =>
        [
          ...VUE_QUERY_CACHE_KEYS.payeesList,
          toValue(q) ?? null,
          toValue(sortBy) ?? null,
          toValue(sortDir) ?? null,
        ] as const,
    ),
    queryFn: () =>
      loadPayees({
        q: toValue(q),
        sortBy: toValue(sortBy),
        sortDir: toValue(sortDir),
      }),
    enabled: computed(() => (enabled === undefined ? true : toValue(enabled))),
    // This list is persisted to IndexedDB and every payee-mutating path (CRUD,
    // bulk categorization, CSV import, bank sync) invalidates payeesList, so a
    // restored copy is trustworthy — treat it as fresh and skip the cold-load
    // refetch. Invalidation, not a staleTime timer, is what refreshes it.
    staleTime: Infinity,
  });

  const list = computed<PayeeWithStats[]>(() => query.data.value ?? []);

  return { ...query, list };
};

/**
 * Paginated, sortable Payee list for the management table. Keep the simpler
 * `usePayees` around – it backs the autocomplete dropdowns (PayeeSelectField,
 * PayeeMultiSelectField) where we want a single flat list, not pages.
 */
export const useInfinitePayees = ({
  q,
  sortBy,
  sortDir,
  enabled,
}: {
  q?: MaybeRefOrGetter<string | undefined>;
  sortBy?: MaybeRefOrGetter<PayeeSortBy>;
  sortDir?: MaybeRefOrGetter<PayeeSortDir>;
  enabled?: MaybeRefOrGetter<boolean>;
} = {}) => {
  const query = useInfiniteQuery({
    queryKey: computed(
      () =>
        [
          ...VUE_QUERY_CACHE_KEYS.payeesList,
          'infinite',
          toValue(q) ?? null,
          toValue(sortBy) ?? 'transactionCount',
          toValue(sortDir) ?? 'desc',
        ] as const,
    ),
    queryFn: ({ pageParam }) =>
      loadPayees({
        q: toValue(q),
        sortBy: toValue(sortBy),
        sortDir: toValue(sortDir),
        limit: PAYEES_PAGE_SIZE,
        offset: pageParam * PAYEES_PAGE_SIZE,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAYEES_PAGE_SIZE) return undefined;
      return allPages.length;
    },
    enabled: computed(() => (enabled === undefined ? true : toValue(enabled))),
    staleTime: QUERY_CACHE_STALE_TIME.ANALYTICS,
  });

  const list = computed<PayeeWithStats[]>(() => query.data.value?.pages.flat() ?? []);

  return { ...query, list };
};

/**
 * Account-owner-scoped Payee list – mirror of `useAccountCategories`.
 * The picker in the transaction form swaps to this when the resolved
 * account is shared with the caller, so it shows the *owner's* payees
 * (matching what the backend write paths validate against). The error
 * surface mirrors the categories side: a toast on fetch failure so the
 * picker doesn't silently render an empty list indistinguishable from
 * "owner has no payees".
 */
export const useAccountPayees = ({
  accountId,
  q,
  sortBy,
  sortDir,
  enabled,
}: {
  accountId: MaybeRefOrGetter<string | undefined>;
  q?: MaybeRefOrGetter<string | undefined>;
  sortBy?: MaybeRefOrGetter<PayeeSortBy | undefined>;
  sortDir?: MaybeRefOrGetter<PayeeSortDir | undefined>;
  enabled?: MaybeRefOrGetter<boolean>;
}) => {
  const query = useQuery({
    queryKey: computed(
      () =>
        [
          ...VUE_QUERY_CACHE_KEYS.payeesByAccount,
          toValue(accountId) ?? null,
          toValue(q) ?? null,
          toValue(sortBy) ?? null,
          toValue(sortDir) ?? null,
        ] as const,
    ),
    queryFn: () =>
      loadPayeesByAccount({
        accountId: toValue(accountId)!,
        q: toValue(q),
        sortBy: toValue(sortBy),
        sortDir: toValue(sortDir),
      }),
    enabled: computed(() => {
      const flag = enabled === undefined ? true : toValue(enabled);
      return flag && toValue(accountId) !== undefined;
    }),
    staleTime: QUERY_CACHE_STALE_TIME.ANALYTICS,
  });

  const { addErrorNotification } = useNotificationCenter();
  const { t } = useI18n();
  watch(query.isError, (isError) => {
    if (isError) {
      addErrorNotification(t('fields.payeeSelect.sharedOwnerPayeesLoadError'));
    }
  });

  const list = computed<PayeeWithStats[]>(() => query.data.value ?? []);

  return { ...query, list };
};

/**
 * Resolve a set of payee ids to full records, one cached `GET /payees/:id` per id
 * (shared with `usePayee`'s cache). Backs the multi-select trigger so a restored
 * selection — e.g. a saved Pivot view — renders payee names/logos immediately,
 * without waiting for the dropdown's lazy search list to be opened.
 */
export const usePayeesByIds = ({ ids }: { ids: MaybeRefOrGetter<string[]> }) => {
  const queries = useQueries({
    queries: computed(() =>
      toValue(ids).map((id) => ({
        queryKey: [...VUE_QUERY_CACHE_KEYS.payeeById, id] as const,
        queryFn: () => loadPayeeById({ id }),
        staleTime: QUERY_CACHE_STALE_TIME.ANALYTICS,
      })),
    ),
  });

  const byId = computed<Map<string, PayeeWithStats>>(() => {
    const map = new Map<string, PayeeWithStats>();
    for (const result of queries.value) {
      if (result.data) map.set(result.data.id, result.data);
    }
    return map;
  });

  // True when any id failed to resolve, so a consumer can distinguish a genuinely-missing payee
  // from a failed fetch instead of silently rendering the placeholder label.
  const isError = computed(() => queries.value.some((result) => result.isError));

  return { byId, isError };
};

export const usePayee = ({
  id,
  enabled,
}: {
  id: MaybeRefOrGetter<string | undefined>;
  enabled?: MaybeRefOrGetter<boolean>;
}) => {
  return useQuery({
    queryKey: computed(() => [...VUE_QUERY_CACHE_KEYS.payeeById, toValue(id)] as const),
    queryFn: () => loadPayeeById({ id: toValue(id)! }),
    enabled: computed(() => {
      const flag = enabled === undefined ? true : toValue(enabled);
      return flag && toValue(id) !== undefined;
    }),
    staleTime: QUERY_CACHE_STALE_TIME.ANALYTICS,
  });
};

const invalidatePayeesScope = (queryClient: ReturnType<typeof useQueryClient>) => {
  queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.payeesList });
  queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.payeesByAccount });
  queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.payeeById });
};

export const useCreatePayee = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePayeePayload) => createPayee(payload),
    onSuccess: () => invalidatePayeesScope(queryClient),
  });
};

export const useUpdatePayee = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdatePayeePayload }) => updatePayee({ id, payload }),
    onSuccess: () => invalidatePayeesScope(queryClient),
  });
};

export const useDeletePayee = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => deletePayee({ id }),
    onSuccess: () => invalidatePayeesScope(queryClient),
  });
};

export const useApplyPayeeTagsToExisting = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => applyPayeeTagsToExisting({ id }),
    onSuccess: () => {
      // Tagged transactions surface in transaction lists/details – refresh
      // everything transaction-shaped alongside the payee scope.
      queryClient.invalidateQueries({ queryKey: [VUE_QUERY_GLOBAL_PREFIXES.transactionChange] });
      invalidatePayeesScope(queryClient);
    },
  });
};

export const useMergePayees = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sourceId, targetPayeeId }: { sourceId: string; targetPayeeId: string }) =>
      mergePayees({ sourceId, targetPayeeId }),
    onSuccess: () => invalidatePayeesScope(queryClient),
  });
};

export const useCreatePayeeAlias = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ payeeId, rawName }: { payeeId: string; rawName: string }) => createPayeeAlias({ payeeId, rawName }),
    onSuccess: () => invalidatePayeesScope(queryClient),
  });
};

export const useDeletePayeeAlias = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ payeeId, aliasId }: { payeeId: string; aliasId: string }) => deletePayeeAlias({ payeeId, aliasId }),
    onSuccess: () => invalidatePayeesScope(queryClient),
  });
};

const invalidateIgnoredNames = (queryClient: ReturnType<typeof useQueryClient>) => {
  queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.payeesIgnoredNames });
};

export const useIgnoredNames = () => {
  const query = useQuery({
    queryKey: VUE_QUERY_CACHE_KEYS.payeesIgnoredNames,
    queryFn: () => listIgnoredNames(),
    staleTime: QUERY_CACHE_STALE_TIME.ANALYTICS,
  });
  const list = computed<IgnoredName[]>(() => query.data.value ?? []);
  return { ...query, list };
};

export const useAddIgnoredName = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ rawName, force }: { rawName: string; force?: boolean }) => addIgnoredName({ rawName, force }),
    onSuccess: () => {
      invalidateIgnoredNames(queryClient);
      invalidatePayeesScope(queryClient);
    },
  });
};

export const useRemoveIgnoredName = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => removeIgnoredName({ id }),
    onSuccess: () => invalidateIgnoredNames(queryClient),
  });
};

export const useDeletePayeeAndIgnore = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => deletePayeeAndIgnore({ id }),
    onSuccess: () => {
      invalidatePayeesScope(queryClient);
      invalidateIgnoredNames(queryClient);
    },
  });
};

export const useBulkUpdateCategorizationMode = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ mode }: { mode: CATEGORIZATION_MODE }) => bulkUpdateCategorizationMode({ mode }),
    onSuccess: () => invalidatePayeesScope(queryClient),
  });
};

export const useResetPayeeLogo = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => resetPayeeLogo({ id }),
    onSuccess: () => invalidatePayeesScope(queryClient),
  });
};
