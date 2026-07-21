<template>
  <!-- Borders live on cells, not the row: the table uses border-separate, where <tr> borders don't render -->
  <tr
    class="hover:bg-muted/50 h-10 cursor-pointer divide-x transition-colors"
    aria-haspopup="true"
    :data-index="index"
    @click="emitRecordClick"
  >
    <!-- Selection checkbox (sticky so it survives horizontal scroll) -->
    <td class="bg-card sticky left-0 z-1 w-8 border-b px-1" @click.stop>
      <label class="flex items-center justify-center">
        <Checkbox v-if="isSelectable" :model-value="isSelected" @update:model-value="onSelectionChange" />
        <ResponsiveTooltip
          v-else-if="unselectableReason"
          :delay-duration="100"
          :content="$t(`transactions.bulkEdit.unselectableReasons.${unselectableReason}`)"
          content-class-name="max-w-56"
        >
          <InfoIcon class="text-muted-foreground size-3.5 cursor-help" />
        </ResponsiveTooltip>
        <div v-else class="size-4" />
      </label>
    </td>

    <td
      v-for="column in visibleColumns"
      :key="column.id"
      :class="['overflow-hidden border-b px-3 text-sm whitespace-nowrap', column.align === 'right' && 'text-right']"
    >
      <!-- Date -->
      <template v-if="column.id === TABLE_COLUMN.date">
        <span class="text-muted-foreground tabular-nums">{{ formattedDate }}</span>
      </template>

      <!-- Account -->
      <template v-else-if="column.id === TABLE_COLUMN.account">
        <div class="flex items-center gap-1.5">
          <span class="max-w-36 truncate">{{ accountFrom?.name }}</span>
          <template v-if="isCommonTransfer">
            <ArrowRightIcon :size="13" class="shrink-0 opacity-60" />
            <span class="max-w-36 truncate">{{ transferDestinationName }}</span>
          </template>
          <template v-else-if="isOutOfWalletTransfer">
            <ArrowRightIcon :size="13" class="shrink-0 opacity-60" />
            <span class="text-muted-foreground">{{ $t('transactions.table.outOfWallet') }}</span>
          </template>
          <template v-else-if="isPortfolioLinked">
            <ArrowRightIcon :size="13" class="shrink-0 opacity-60" />
            <BriefcaseIcon :size="13" class="text-app-transfer-color shrink-0" />
            <span class="max-w-36 truncate">{{ portfolioName }}</span>
          </template>
        </div>
      </template>

      <!-- Category -->
      <template v-else-if="column.id === TABLE_COLUMN.category">
        <div v-if="!isTransferRow && category" class="flex items-center gap-2">
          <CategoryCircle :category="category" />
          <span class="max-w-32 truncate">{{ category.name }}</span>
        </div>
        <span v-else class="text-muted-foreground">—</span>
      </template>

      <!-- Payee -->
      <template v-else-if="column.id === TABLE_COLUMN.payee">
        <div v-if="payee" class="flex items-center gap-2">
          <BrandLogo :domain="payee.logoDomain" :name="payee.name" class="size-5 shrink-0" />
          <DesktopOnlyTooltip :content="payee.name" only-when-truncated>
            <span class="max-w-32 truncate">{{ payee.name }}</span>
          </DesktopOnlyTooltip>
        </div>
        <span v-else class="text-muted-foreground">—</span>
      </template>

      <!-- Amount (original currency) -->
      <template v-else-if="column.id === TABLE_COLUMN.amount">
        <span :class="['text-amount tabular-nums', amountColorClass]">{{ formattedAmount }}</span>
      </template>

      <!-- Ref amount (base currency) -->
      <template v-else-if="column.id === TABLE_COLUMN.refAmount">
        <span :class="['text-amount tabular-nums', amountColorClass]">{{ formattedRefAmount }}</span>
      </template>

      <!-- Note -->
      <template v-else-if="column.id === TABLE_COLUMN.note">
        <DesktopOnlyTooltip v-if="tx.note" :content="tx.note">
          <span class="text-muted-foreground block max-w-40 truncate">{{ tx.note }}</span>
        </DesktopOnlyTooltip>
      </template>

      <!-- Tags -->
      <template v-else-if="column.id === TABLE_COLUMN.tags">
        <DesktopOnlyTooltip v-if="txTags.length" :disabled="txTags.length <= 1">
          <div class="flex items-center gap-1">
            <span
              class="inline-block max-w-37.5 truncate rounded-full px-2 py-0.5 text-xs font-medium text-white/90"
              :style="{ backgroundColor: txTags[0]!.color }"
            >
              {{ txTags[0]!.name }}
            </span>
            <span v-if="hiddenTagsCount > 0" class="text-muted-foreground text-xs">+{{ hiddenTagsCount }}</span>
          </div>
          <template #content>
            <ScrollArea class="max-h-75">
              <div class="flex flex-col items-start gap-1 pr-2">
                <span
                  v-for="tag in txTags"
                  :key="tag.id"
                  class="inline-block max-w-37.5 truncate rounded-full px-2 py-0.5 text-xs font-medium text-white/90"
                  :style="{ backgroundColor: tag.color }"
                >
                  {{ tag.name }}
                </span>
              </div>
            </ScrollArea>
          </template>
        </DesktopOnlyTooltip>
      </template>

      <!-- Categorization source -->
      <template v-else-if="column.id === TABLE_COLUMN.categorizationSource">
        <span v-if="categorizationSourceLabel" class="text-muted-foreground text-xs">
          {{ categorizationSourceLabel }}
        </span>
      </template>

      <!-- Group -->
      <template v-else-if="column.id === TABLE_COLUMN.group">
        <span v-if="groupName" class="max-w-32 truncate">{{ groupName }}</span>
      </template>

      <!-- Refund indicator -->
      <template v-else-if="column.id === TABLE_COLUMN.refundIndicator">
        <RefundIndicator :transaction="tx" />
      </template>

      <!-- Split indicator -->
      <template v-else-if="column.id === TABLE_COLUMN.splitIndicator">
        <SplitIndicator :transaction="tx" />
      </template>
    </td>
  </tr>
</template>

<script lang="ts" setup>
import BrandLogo from '@/components/common/brand-logo.vue';
import CategoryCircle from '@/components/common/category-circle.vue';
import ResponsiveTooltip from '@/components/common/responsive-tooltip.vue';
import { Checkbox } from '@/components/lib/ui/checkbox';
import { ScrollArea } from '@/components/lib/ui/scroll-area';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import RefundIndicator from '@/components/transactions-list/indicators/refund-indicator.vue';
import SplitIndicator from '@/components/transactions-list/indicators/split-indicator.vue';
import { useOppositeTxRecord } from '@/composable/data-queries/opposite-tx-record';
import type { BulkUnselectableReason } from '@/composable/transaction-selection';
import { useTransactionPortfolioLink } from '@/composable/data-queries/portfolio-transfers';
import { useFormatCurrency } from '@/composable/formatters';
import { formatUIAmount } from '@/js/helpers';
import { useAccountsStore, useCategoriesStore } from '@/stores';
import {
  CATEGORIZATION_SOURCE,
  PayeeLookupItem,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
  TransactionModel,
} from '@bt/shared/types';
import { ArrowRightIcon, BriefcaseIcon, InfoIcon } from '@lucide/vue';
import { format } from 'date-fns';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import { type ColumnDefinition, TABLE_COLUMN } from './columns';

const MAX_VISIBLE_TAGS = 1;

const props = defineProps<{
  tx: TransactionModel;
  visibleColumns: ColumnDefinition[];
  index: number;
  isSelected: boolean;
  isSelectable: boolean;
  /** Shown as an explainer tooltip in place of the checkbox when not selectable. */
  unselectableReason?: BulkUnselectableReason | null;
  /** Resolved payee (name + logo domain) for the beneficiary cell; undefined for transfers/unassigned. */
  payee: PayeeLookupItem | undefined;
}>();

const emit = defineEmits<{
  'record-click': [[value: TransactionModel, oppositeTx: TransactionModel | undefined]];
  'selection-change': [{ value: boolean; id: string; index: number }];
}>();

const { t, te } = useI18n();
const { categoriesMap } = storeToRefs(useCategoriesStore());
const { accountsRecord } = storeToRefs(useAccountsStore());
const { formatBaseCurrency } = useFormatCurrency();

const isCommonTransfer = computed(() => props.tx.transferNature === TRANSACTION_TRANSFER_NATURE.common_transfer);
const isOutOfWalletTransfer = computed(
  () => props.tx.transferNature === TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
);
const isPortfolioLinked = computed(() => props.tx.transferNature === TRANSACTION_TRANSFER_NATURE.transfer_to_portfolio);
const isTransferRow = computed(() => isCommonTransfer.value || isOutOfWalletTransfer.value || isPortfolioLinked.value);

// Opposite leg lookup is only meaningful for common transfers; the composable
// no-ops for other natures.
const { data: oppositeTx } = useOppositeTxRecord(() => props.tx);

const portfolioLinkId = computed(() => (isPortfolioLinked.value ? props.tx.id : undefined));
const { data: portfolioLinkData } = useTransactionPortfolioLink(portfolioLinkId);
const portfolioName = computed(() => portfolioLinkData.value?.portfolioName ?? '');

const category = computed(() => categoriesMap.value[props.tx.categoryId]);
const accountFrom = computed(() => accountsRecord.value[props.tx.accountId]);
const transferDestinationName = computed(() => {
  if (!oppositeTx.value) return t('transactions.transfer.hiddenAccount');
  return accountsRecord.value[oppositeTx.value.accountId]?.name ?? t('transactions.transfer.hiddenAccount');
});

const formattedDate = computed(() => format(new Date(props.tx.time), 'd MMM y'));

const amountColorClass = computed(() => {
  if (isCommonTransfer.value) return 'text-app-transfer-color';
  if (props.tx.transactionType === TRANSACTION_TYPES.income) return 'text-app-income-color';
  return 'text-app-expense-color';
});

const signedAmount = (amount: number) => (props.tx.transactionType === TRANSACTION_TYPES.expense ? -amount : amount);

const formattedAmount = computed(() =>
  formatUIAmount(signedAmount(props.tx.amount), { currency: props.tx.currencyCode }),
);
const formattedRefAmount = computed(() => formatBaseCurrency(signedAmount(props.tx.refAmount)));

const txTags = computed(() => props.tx.tags ?? []);
const hiddenTagsCount = computed(() => Math.max(0, txTags.value.length - MAX_VISIBLE_TAGS));

const groupName = computed(() => props.tx.transactionGroups?.[0]?.name);

const categorizationSourceLabel = computed(() => {
  const source = props.tx.categorizationMeta?.source as CATEGORIZATION_SOURCE | undefined;
  if (!source) return undefined;
  const key = `transactions.table.categorizationSourceValues.${source}`;
  return te(key) ? t(key) : source;
});

const emitRecordClick = () => {
  emit('record-click', [props.tx, oppositeTx.value ?? undefined]);
};

const onSelectionChange = (value: boolean | 'indeterminate') => {
  emit('selection-change', { value: value === true, id: props.tx.id, index: props.index });
};
</script>
