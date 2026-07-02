import {
  createLoan,
  deleteLoan,
  getLoanById,
  getLoans,
  linkLoanPayments,
  unlinkLoanPayment,
  updateLoan,
} from '@/api/loans';
import { VUE_QUERY_CACHE_KEYS, VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { type MaybeRef, computed, unref } from 'vue';

export const useLoans = (queryOptions = {}) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryFn: getLoans,
    queryKey: VUE_QUERY_CACHE_KEYS.loansList,
    staleTime: 1000 * 60 * 5,
    ...queryOptions,
  });

  return {
    ...query,
    invalidate: () => queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.loansList }),
  };
};

// A loan IS an Accounts row — mutations must also bust the global accounts cache,
// or pickers (tx destination, sidebar) won't see the change.
const invalidateAccountsCache = (queryClient: ReturnType<typeof useQueryClient>) => {
  queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.allAccounts });
};

export const useCreateLoan = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createLoan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.loansList });
      invalidateAccountsCache(queryClient);
    },
  });
};

export const useUpdateLoan = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateLoan,
    onSuccess: (loan) => {
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.loansList });
      queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.loanDetail, loan.id] });
      invalidateAccountsCache(queryClient);
    },
  });
};

export const useDeleteLoan = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteLoan,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.loansList });
      queryClient.removeQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.loanDetail, variables.id] });
      invalidateAccountsCache(queryClient);
    },
  });
};

export const useLinkLoanPayments = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: linkLoanPayments,
    // Linking rewrites transactions and recomputes balance/projection; the
    // transactionChange prefix fans out to loan detail, payment lists, records, and accounts cache.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [VUE_QUERY_GLOBAL_PREFIXES.transactionChange] });
    },
  });
};

export const useUnlinkLoanPayment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: unlinkLoanPayment,
    // Unlinking deletes the loan-side leg and restores the expense; the
    // transactionChange prefix fans out to loan detail, payment lists, records, and accounts cache.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [VUE_QUERY_GLOBAL_PREFIXES.transactionChange] });
    },
  });
};

export const useLoanById = ({ id }: { id: MaybeRef<string> }) => {
  const queryClient = useQueryClient();

  const queryKey = computed(() => [...VUE_QUERY_CACHE_KEYS.loanDetail, unref(id)] as const);

  const query = useQuery({
    queryFn: () => getLoanById({ id: unref(id) }),
    queryKey,
    staleTime: 1000 * 60 * 5,
    enabled: computed(() => Boolean(unref(id))),
  });

  return {
    ...query,
    invalidate: () => queryClient.invalidateQueries({ queryKey: queryKey.value }),
  };
};
