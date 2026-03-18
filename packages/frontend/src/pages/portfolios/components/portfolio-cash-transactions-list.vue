<template>
  <div>
    <!-- Loading -->
    <div v-if="isLoading" class="space-y-3">
      <div v-for="i in 3" :key="i" class="flex items-center justify-between py-2">
        <div class="space-y-1.5">
          <div class="bg-muted h-4 w-24 animate-pulse rounded" />
          <div class="bg-muted h-3 w-16 animate-pulse rounded" />
        </div>
        <div class="bg-muted h-4 w-20 animate-pulse rounded" />
      </div>
    </div>

    <!-- Empty state -->
    <p v-else-if="!transfers?.length" class="text-muted-foreground py-4 text-center text-sm">
      {{ $t('portfolioDetail.cashBalances.cashTransactions.emptyState') }}
    </p>

    <!-- Transfers list -->
    <div v-else class="divide-y">
      <div
        v-for="transfer in transfers"
        :key="transfer.id"
        class="flex items-center justify-between py-3 first:pt-0 last:pb-0"
      >
        <template v-for="(dp, _) in [getTransferDisplayProps(transfer)]" :key="_">
          <div class="flex items-center gap-3">
            <div class="flex size-8 items-center justify-center rounded-full" :class="dp.iconContainerClass">
              <component :is="dp.icon" class="size-4" />
            </div>
            <div>
              <p class="text-sm font-medium">{{ dp.label }}</p>
              <p class="text-muted-foreground text-xs">
                {{ formatDate(transfer.date) }}
                <span v-if="transfer.description"> &middot; {{ transfer.description }}</span>
              </p>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <div v-if="dp.type === 'exchange' && transfer.toCurrencyCode && transfer.toAmount" class="text-right">
              <p class="text-app-expense-color text-sm font-semibold">
                -{{ formatAmountByCurrencyCode(Number(transfer.amount), transfer.currencyCode) }}
              </p>
              <p class="text-app-income-color text-sm font-semibold">
                +{{ formatAmountByCurrencyCode(Number(transfer.toAmount), transfer.toCurrencyCode) }}
              </p>
            </div>
            <div v-else class="text-right">
              <p class="text-sm font-semibold" :class="dp.amountClass">
                {{ dp.amountPrefix }}{{ formatAmountByCurrencyCode(Number(transfer.amount), transfer.currencyCode) }}
              </p>
            </div>

            <UiButton
              variant="ghost-destructive"
              size="icon-sm"
              :disabled="deleteMutation.isPending.value"
              @click="openDeleteDialog(transfer)"
            >
              <Trash2Icon class="size-3.5" />
            </UiButton>
          </div>
        </template>
      </div>
    </div>
    <!-- Delete confirmation dialog -->
    <ResponsiveAlertDialog
      v-model:open="isDeleteDialogOpen"
      :cancel-label="$t('forms.directCashTransaction.cancelButton')"
      :confirm-label="$t('portfolioDetail.actions.delete')"
      confirm-variant="destructive"
      @confirm="confirmDelete"
    >
      <template #title>
        {{ $t('portfolioDetail.cashBalances.cashTransactions.deleteConfirm') }}
      </template>
      <template v-if="transferToDelete?.transactionId" #description>
        {{ $t('portfolioDetail.cashBalances.cashTransactions.linkedTransactionNote') }}
      </template>

      <RadioGroup v-if="transferToDelete?.transactionId" v-model="linkedTxAction" class="gap-3">
        <div class="flex items-center gap-2">
          <RadioGroupItem id="keep" value="keep" />
          <Label for="keep" class="cursor-pointer text-sm font-normal">
            {{ $t('portfolioDetail.cashBalances.cashTransactions.keepLinkedTransaction') }}
          </Label>
        </div>
        <div class="flex items-center gap-2">
          <RadioGroupItem id="delete" value="delete" />
          <Label for="delete" class="cursor-pointer text-sm font-normal">
            {{ $t('portfolioDetail.cashBalances.cashTransactions.deleteLinkedTransaction') }}
          </Label>
        </div>
      </RadioGroup>
    </ResponsiveAlertDialog>
  </div>
</template>

<script setup lang="ts">
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Label } from '@/components/lib/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/lib/ui/radio-group';
import { useDeletePortfolioTransfer, usePortfolioTransfers } from '@/composable/data-queries/portfolio-transfers';
import { useFormatCurrency } from '@/composable/formatters';
import type { PortfolioModel } from '@bt/shared/types';
import type { PortfolioTransferModel } from '@bt/shared/types/investments';
import { format } from 'date-fns';
import { ArrowDownIcon, ArrowUpIcon, RefreshCwIcon, Trash2Icon } from 'lucide-vue-next';
import { ref, toRef } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{ portfolioId: number; portfolio: PortfolioModel }>();
const portfolioId = toRef(props, 'portfolioId');

const { t } = useI18n();
const { formatAmountByCurrencyCode } = useFormatCurrency();

const { data: transfers, isLoading } = usePortfolioTransfers(portfolioId);
const deleteMutation = useDeletePortfolioTransfer();

const linkedTxAction = ref<'keep' | 'delete'>('keep');
const isDeleteDialogOpen = ref(false);
const transferToDelete = ref<PortfolioTransferModel | null>(null);

const openDeleteDialog = (transfer: PortfolioTransferModel) => {
  transferToDelete.value = transfer;
  linkedTxAction.value = 'keep';
  isDeleteDialogOpen.value = true;
};

const confirmDelete = () => {
  if (transferToDelete.value) {
    handleDelete(transferToDelete.value);
  }
};

const formatDate = (date: string) => format(new Date(date), 'MMM d, yyyy');

function isCurrencyExchange(transfer: PortfolioTransferModel): boolean {
  return !!transfer.toCurrencyCode && !!transfer.toAmount;
}

function getTransferDisplayProps(transfer: PortfolioTransferModel) {
  if (isCurrencyExchange(transfer)) {
    return {
      type: 'exchange' as const,
      label: t('portfolioDetail.cashBalances.cashTransactions.exchange'),
      icon: RefreshCwIcon,
      iconContainerClass: 'bg-app-transfer-color/10 text-app-transfer-color',
      amountClass: 'text-app-transfer-color',
      amountPrefix: '',
    };
  }

  let type: string;

  if (!transfer.fromAccountId && !transfer.fromPortfolioId && transfer.toPortfolioId) {
    type = 'deposit';
  } else if (!transfer.toAccountId && !transfer.toPortfolioId && transfer.fromPortfolioId) {
    type = 'withdrawal';
  } else if (transfer.fromAccountId) {
    type = 'transfer-in';
  } else if (transfer.toAccountId) {
    type = 'transfer-out';
  } else if (transfer.toPortfolioId === props.portfolioId) {
    type = 'transfer-in';
  } else {
    type = 'transfer-out';
  }

  const isOutgoing = type === 'withdrawal' || type === 'transfer-out';

  const labels: Record<string, string> = {
    deposit: t('portfolioDetail.cashBalances.cashTransactions.deposit'),
    withdrawal: t('portfolioDetail.cashBalances.cashTransactions.withdrawal'),
    'transfer-in': t('portfolioDetail.cashBalances.cashTransactions.transferIn'),
    'transfer-out': t('portfolioDetail.cashBalances.cashTransactions.transferOut'),
  };

  return {
    type: type as 'deposit' | 'withdrawal' | 'transfer-in' | 'transfer-out',
    label: labels[type] || type,
    icon: isOutgoing ? ArrowUpIcon : ArrowDownIcon,
    iconContainerClass: isOutgoing
      ? 'bg-app-expense-color/10 text-destructive-text'
      : 'bg-app-income-color/10 text-app-income-color',
    amountClass: isOutgoing ? 'text-app-expense-color' : 'text-app-income-color',
    amountPrefix: isOutgoing ? '-' : '+',
  };
}

const handleDelete = async (transfer: PortfolioTransferModel) => {
  await deleteMutation.mutateAsync({
    portfolioId: props.portfolioId,
    transferId: transfer.id,
    deleteLinkedTransaction: transfer.transactionId ? linkedTxAction.value === 'delete' : undefined,
  });
  isDeleteDialogOpen.value = false;
};
</script>
