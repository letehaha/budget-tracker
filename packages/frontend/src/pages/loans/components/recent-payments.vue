<template>
  <Card>
    <CardHeader class="pb-3">
      <div class="flex items-center justify-between gap-2">
        <div class="text-base font-semibold">{{ $t('loans.detail.payments.title') }}</div>

        <ResponsiveDialog v-if="hasMorePayments" v-model:open="isAllPaymentsOpen" dialog-content-class="max-w-lg">
          <template #trigger>
            <Button variant="link" size="sm" class="text-muted-foreground h-auto p-0">
              {{ $t('loans.detail.payments.seeAll') }}
            </Button>
          </template>

          <template #title>{{ $t('loans.detail.payments.allTitle') }}</template>

          <ScrollArea class="max-h-[60dvh]">
            <div class="space-y-1">
              <TransactionRecord
                v-for="payment in allPayments"
                :key="payment.id"
                :tx="payment"
                @record-click="handleRecordClick"
              />
            </div>

            <Button
              v-if="allPaymentsQuery.hasNextPage.value"
              variant="secondary"
              class="mt-3 w-full"
              :disabled="allPaymentsQuery.isFetchingNextPage.value"
              @click="() => allPaymentsQuery.fetchNextPage()"
            >
              {{ $t('loans.detail.payments.loadMore') }}
            </Button>
          </ScrollArea>
        </ResponsiveDialog>
      </div>
    </CardHeader>
    <CardContent>
      <div v-if="paymentsQuery.isLoading.value" class="space-y-2">
        <div v-for="i in 3" :key="i" class="flex items-center justify-between gap-3">
          <div class="bg-muted h-4 w-32 animate-pulse rounded" />
          <div class="bg-muted h-4 w-20 animate-pulse rounded" />
        </div>
      </div>

      <div v-else-if="paymentsQuery.error.value" class="text-destructive-text py-3 text-sm">
        {{ $t('loans.detail.payments.loadError') }}
      </div>

      <div v-else-if="!payments.length" class="text-muted-foreground py-6 text-center text-sm">
        {{ $t('loans.detail.payments.empty') }}
      </div>

      <div v-else class="space-y-1">
        <TransactionRecord
          v-for="payment in visiblePayments"
          :key="payment.id"
          :tx="payment"
          @record-click="handleRecordClick"
        />
      </div>
    </CardContent>
  </Card>

  <LoanPaymentDialog
    v-if="loanAccount && dialogTransaction && dialogOppositeTransaction"
    v-model:open="isDialogOpen"
    :loan-account="loanAccount"
    :transaction="dialogTransaction"
    :opposite-transaction="dialogOppositeTransaction"
  />
</template>

<script setup lang="ts">
import { loadTransactions, loadTransactionsByTransferId } from '@/api/transactions';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { type LoanApi } from '@/api/loans';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import { Button } from '@/components/lib/ui/button';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { ScrollArea } from '@/components/lib/ui/scroll-area';
import { useNotificationCenter } from '@/components/notification-center';
import TransactionRecord from '@/components/transactions-list/transaction-record.vue';
import { captureException } from '@/lib/sentry';
import { useAccountsStore } from '@/stores';
import { TRANSACTION_TYPES, type TransactionModel } from '@bt/shared/types';
import { useInfiniteQuery, useQuery } from '@tanstack/vue-query';
import { storeToRefs } from 'pinia';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import LoanPaymentDialog from './loan-payment-dialog/index.vue';

const props = defineProps<{ loan: LoanApi }>();

// The card itself shows only the latest few payments so it stays the same
// height as its grid neighbors; the full history lives in the "See all" dialog.
const VISIBLE_PAYMENTS_COUNT = 3;
// Fetched over-count: the loan account also carries non-income legs (interest
// charges, disbursements) that get filtered out below, plus we need at least
// one extra income leg to know whether to render the "See all" trigger.
const RECENT_PAYMENTS_LIMIT = 10;
const ALL_PAYMENTS_PAGE_SIZE = 30;

const { t } = useI18n();
const { addErrorNotification } = useNotificationCenter();
const { accountsRecord } = storeToRefs(useAccountsStore());

const loanAccount = computed(() => accountsRecord.value[props.loan.id]);

const paymentsQuery = useQuery({
  // The key's `transactionChange` prefix opts this query into the global
  // invalidation fired by use-submit-transaction / use-delete-transaction,
  // so a recorded payment shows up here without a manual refetch.
  queryKey: computed(() => [...VUE_QUERY_CACHE_KEYS.loanRecentPayments, props.loan.id] as const),
  queryFn: () =>
    loadTransactions({
      from: 0,
      limit: RECENT_PAYMENTS_LIMIT,
      accountIds: [props.loan.id],
    }),
  staleTime: 1000 * 60 * 5,
});

// On a loan account, paid principal arrives as an income leg (positive amount).
// Interest charges and disbursements show up as negative legs — filter those
// out so the section reads as "money you sent against this loan".
const filterPayments = (txs: TransactionModel[]) => txs.filter((tx) => tx.transactionType === TRANSACTION_TYPES.income);

const payments = computed(() => filterPayments(paymentsQuery.data.value ?? []));
const visiblePayments = computed(() => payments.value.slice(0, VISIBLE_PAYMENTS_COUNT));
// More than the card shows, OR the raw page came back full — in the latter
// case older income legs may exist past the fetch window even when the
// filtered count is small (interest/disbursement legs crowd out payments).
const hasMorePayments = computed(
  () =>
    payments.value.length > VISIBLE_PAYMENTS_COUNT || (paymentsQuery.data.value ?? []).length === RECENT_PAYMENTS_LIMIT,
);

const isAllPaymentsOpen = ref(false);

const allPaymentsQuery = useInfiniteQuery({
  queryKey: computed(() => [...VUE_QUERY_CACHE_KEYS.loanAllPayments, props.loan.id] as const),
  queryFn: ({ pageParam }) =>
    loadTransactions({
      from: pageParam * ALL_PAYMENTS_PAGE_SIZE,
      limit: ALL_PAYMENTS_PAGE_SIZE,
      accountIds: [props.loan.id],
    }),
  initialPageParam: 0,
  getNextPageParam: (lastPage, pages) => (lastPage.length < ALL_PAYMENTS_PAGE_SIZE ? undefined : pages.length),
  // Don't fetch the full history until the user actually opens the dialog.
  enabled: isAllPaymentsOpen,
  staleTime: 1000 * 60 * 5,
});

const allPayments = computed(() => filterPayments(allPaymentsQuery.data.value?.pages.flat() ?? []));

// Rows hold the loan-side (income) leg; the dedicated dialog also needs the
// source-side (expense) leg. TransactionRecord already resolves the opposite
// leg for its grouped display and hands it along with the click — fall back to
// an explicit transferId fetch only when that resolution hasn't finished yet.
const isDialogOpen = ref(false);
const dialogTransaction = ref<TransactionModel | null>(null);
const dialogOppositeTransaction = ref<TransactionModel | null>(null);

const openPaymentDialog = ({ sourceLeg, loanLeg }: { sourceLeg: TransactionModel; loanLeg: TransactionModel }) => {
  dialogTransaction.value = sourceLeg;
  dialogOppositeTransaction.value = loanLeg;
  isDialogOpen.value = true;
};

const handleRecordClick = async ([payment, oppositeTx]: [TransactionModel, TransactionModel | undefined]) => {
  if (oppositeTx) {
    openPaymentDialog({ sourceLeg: oppositeTx, loanLeg: payment });
    return;
  }

  // Orphaned leg: its pair was deleted and `transferId` cleared. There is no
  // source leg to edit through the loan dialog — tell the user instead of
  // letting the click silently do nothing.
  if (!payment.transferId) {
    addErrorNotification(t('loans.detail.payments.loadError'));
    return;
  }
  try {
    const legs = await loadTransactionsByTransferId(payment.transferId);
    const sourceLeg = legs?.find((leg) => leg.id !== payment.id);
    if (!sourceLeg) {
      addErrorNotification(t('loans.detail.payments.loadError'));
      return;
    }
    openPaymentDialog({ sourceLeg, loanLeg: payment });
  } catch (error) {
    captureException({ error, context: { source: 'loanRecentPayments', transferId: payment.transferId } });
    addErrorNotification(t('loans.detail.payments.loadError'));
  }
};
</script>
