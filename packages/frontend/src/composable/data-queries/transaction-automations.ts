import {
  createTransactionAutomation,
  deleteTransactionAutomation,
  loadTransactionAutomations,
  previewTransactionAutomation,
  reorderTransactionAutomations,
  updateTransactionAutomation,
} from '@/api/transaction-automations';
import { QUERY_CACHE_STALE_TIME, VUE_QUERY_CACHE_KEYS } from '@/common/const';
import type { TransactionAutomationModel } from '@bt/shared/types';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { type MaybeRefOrGetter, computed, toValue } from 'vue';

const listKey = VUE_QUERY_CACHE_KEYS.transactionAutomationsList;

const invalidateAutomationsScope = ({ queryClient }: { queryClient: QueryClient }) =>
  queryClient.invalidateQueries({ queryKey: listKey });

export const useTransactionAutomations = () => {
  const query = useQuery({
    queryKey: listKey,
    queryFn: loadTransactionAutomations,
    staleTime: QUERY_CACHE_STALE_TIME.ANALYTICS,
  });

  const list = computed<TransactionAutomationModel[]>(() => query.data.value ?? []);

  return { ...query, list };
};

/** Reads the rule out of the list query — there is no by-id endpoint. */
export const useTransactionAutomation = ({ id }: { id: MaybeRefOrGetter<string | undefined> }) => {
  const { list, isFetched, isLoading, isError } = useTransactionAutomations();

  const automation = computed<TransactionAutomationModel | null>(
    () => list.value.find((rule) => rule.id === toValue(id)) ?? null,
  );

  return { automation, isFetched, isLoading, isError };
};

const snapshotList = ({ queryClient }: { queryClient: QueryClient }) => {
  const previous = queryClient.getQueryData<TransactionAutomationModel[]>(listKey);
  return { previous };
};

const restoreList = ({
  queryClient,
  previous,
}: {
  queryClient: QueryClient;
  previous?: TransactionAutomationModel[];
}) => previous && queryClient.setQueryData(listKey, previous);

export const useCreateAutomation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTransactionAutomation,
    onSuccess: () => invalidateAutomationsScope({ queryClient }),
  });
};

export const useUpdateAutomation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateTransactionAutomation,
    onMutate: async ({ id, payload }) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const snapshot = snapshotList({ queryClient });
      queryClient.setQueryData<TransactionAutomationModel[]>(listKey, (old) =>
        old?.map((rule) => (rule.id === id ? { ...rule, ...payload } : rule)),
      );
      return snapshot;
    },
    onError: (_error, _variables, context) => restoreList({ queryClient, previous: context?.previous }),
    onSettled: () => invalidateAutomationsScope({ queryClient }),
  });
};

export const useDeleteAutomation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteTransactionAutomation,
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const snapshot = snapshotList({ queryClient });
      queryClient.setQueryData<TransactionAutomationModel[]>(listKey, (old) => old?.filter((rule) => rule.id !== id));
      return snapshot;
    },
    onError: (_error, _variables, context) => restoreList({ queryClient, previous: context?.previous }),
    onSettled: () => invalidateAutomationsScope({ queryClient }),
  });
};

export const useReorderAutomations = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: reorderTransactionAutomations,
    onMutate: async ({ ids }) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const snapshot = snapshotList({ queryClient });
      queryClient.setQueryData<TransactionAutomationModel[]>(listKey, (old) =>
        old ? ids.map((id) => old.find((rule) => rule.id === id)).filter((rule) => rule !== undefined) : old,
      );
      return snapshot;
    },
    onError: (_error, _variables, context) => restoreList({ queryClient, previous: context?.previous }),
    onSettled: () => invalidateAutomationsScope({ queryClient }),
  });
};

export const usePreviewAutomation = () => useMutation({ mutationFn: previewTransactionAutomation });
