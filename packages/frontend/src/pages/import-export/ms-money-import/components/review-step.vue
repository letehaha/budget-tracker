<script setup lang="ts">
/**
 * Microsoft Money review step — the preview before anything is written. Shows
 * what will be imported, what the parser had to leave out (warnings), and lets
 * the user un-mark detected duplicates.
 */
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Callout } from '@/components/lib/ui/callout';
import { StatCard } from '@/components/lib/ui/stat-card';
import DuplicatesTable from '@/pages/import-export/components/review-duplicates-step/duplicates-table.vue';
import { useImportMsMoneyStore } from '@/stores/import-ms-money';
import type { MsMoneyParseWarning } from '@bt/shared/types';
import { ChevronLeftIcon, ChevronRightIcon, LoaderCircleIcon } from '@lucide/vue';
import { format, parseISO } from 'date-fns';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const store = useImportMsMoneyStore();

/** Localized explanation per warning code, so users see why rows were left out. */
const WARNING_LABEL_KEYS: Record<MsMoneyParseWarning['code'], string> = {
  'account-type-unsupported': 'pages.importExport.msMoneyImport.review.warnings.accountTypeUnsupported',
  'void-row-skipped': 'pages.importExport.msMoneyImport.review.warnings.voidRowSkipped',
  'orphan-row-skipped': 'pages.importExport.msMoneyImport.review.warnings.orphanRowSkipped',
  'transfer-counterpart-not-imported':
    'pages.importExport.msMoneyImport.review.warnings.transferCounterpartNotImported',
  'row-limit-reached': 'pages.importExport.msMoneyImport.review.warnings.rowLimitReached',
};

function warningLabel(warning: MsMoneyParseWarning): string {
  return t(WARNING_LABEL_KEYS[warning.code], { count: warning.count });
}

// ---- Derived counts for the stat cards ----

/** Accounts the user chose to leave out; their rows never reach the import. */
const skippedAccounts = computed(() => new Set(store.skippedAccountNames));

const includedTransactions = computed(() =>
  (store.parsedResult?.transactions ?? []).filter((transaction) => !skippedAccounts.value.has(transaction.accountName)),
);

/** A transfer needs both of its accounts imported to stay a transfer. */
const includedTransfers = computed(() =>
  (store.parsedResult?.transfers ?? []).filter(
    (transfer) =>
      !skippedAccounts.value.has(transfer.sourceAccountName) &&
      !skippedAccounts.value.has(transfer.destinationAccountName),
  ),
);

/** Transfer legs whose counterpart account is not part of this import. */
const outOfWalletCount = computed(() => includedTransactions.value.filter((tx) => tx.outOfWallet).length);

/** Detected duplicates the user left marked (will be skipped on import). */
const duplicatesSkippedCount = computed(() => store.skipDuplicateIndices.length);

/**
 * Rows that will actually be created: included transactions + transfers minus
 * the duplicates the user is skipping. Transfers count as one imported row each.
 */
const willImportCount = computed(() =>
  Math.max(0, includedTransactions.value.length + includedTransfers.value.length - duplicatesSkippedCount.value),
);

/** Human date span of the parsed rows, or null when the file had no rows. */
const dateRangeLabel = computed(() => {
  const range = store.parsedResult?.dateRange;
  if (!range) return null;
  return `${format(parseISO(range.from), 'dd MMM yyyy')} — ${format(parseISO(range.to), 'dd MMM yyyy')}`;
});

// ---- Execute ----

const isExecuting = ref(false);

async function handleImport() {
  isExecuting.value = true;
  try {
    await store.execute();
  } catch {
    // Error captured in store.executeError and shown via Callout.
  } finally {
    isExecuting.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Detection loading skeleton -->
    <template v-if="store.isDetectingDuplicates">
      <div class="@container/stat-row">
        <div class="grid grid-cols-2 gap-3 @sm/stat-row:grid-cols-4">
          <div v-for="i in 4" :key="i" class="bg-muted/40 border-border h-16 animate-pulse rounded-lg border p-3" />
        </div>
      </div>
      <div class="bg-muted/40 border-border h-40 animate-pulse rounded-lg border" />
    </template>

    <!-- Detection error -->
    <Callout v-else-if="store.detectError" variant="destructive" role="alert">
      <p>{{ store.detectError }}</p>
    </Callout>

    <template v-else>
      <!-- Summary stat cards — container-query grid -->
      <div class="@container/stat-row">
        <div class="grid grid-cols-2 gap-3 @sm/stat-row:grid-cols-3 @lg/stat-row:grid-cols-5">
          <StatCard
            :label="$t('pages.importExport.msMoneyImport.review.transactions')"
            :value="includedTransactions.length"
            variant="neutral"
          />
          <StatCard
            :label="$t('pages.importExport.msMoneyImport.review.transfersDetected')"
            :value="includedTransfers.length"
            variant="neutral"
          />
          <StatCard
            :label="$t('pages.importExport.msMoneyImport.review.outOfWallet')"
            :value="outOfWalletCount"
            variant="neutral"
          />
          <StatCard
            :label="$t('pages.importExport.msMoneyImport.review.duplicatesSkipped')"
            :value="duplicatesSkippedCount"
            variant="warning"
          />
          <StatCard
            :label="$t('pages.importExport.msMoneyImport.review.willImport')"
            :value="willImportCount"
            variant="success"
          />
        </div>
      </div>

      <p v-if="dateRangeLabel" class="text-muted-foreground text-xs">
        {{ $t('pages.importExport.msMoneyImport.review.dateRange', { range: dateRangeLabel }) }}
      </p>

      <!-- Parse warnings: what the file contained that this import leaves out -->
      <Callout
        v-if="store.parsedResult && store.parsedResult.warnings.length > 0"
        variant="warning"
        :title="$t('pages.importExport.msMoneyImport.review.warningsTitle')"
      >
        <p class="text-xs opacity-80">{{ $t('pages.importExport.msMoneyImport.review.warningsHint') }}</p>
        <ul class="mt-2 list-disc space-y-1 pl-5 text-xs">
          <li v-for="(warning, index) in store.parsedResult.warnings" :key="index">
            <span class="font-medium">{{ warningLabel(warning) }}</span>
            <span class="text-muted-foreground block">{{ warning.message }}</span>
          </li>
        </ul>
      </Callout>

      <!-- Duplicates table -->
      <section v-if="store.duplicates.length > 0" aria-labelledby="ms-money-duplicates-heading">
        <h3 id="ms-money-duplicates-heading" class="text-warning-text mb-1 text-sm font-semibold">
          {{
            $t('pages.importExport.msMoneyImport.review.duplicatesTitle', {
              count: store.duplicates.length,
            })
          }}
        </h3>
        <p class="text-muted-foreground mb-3 text-xs">
          {{ $t('pages.importExport.msMoneyImport.review.duplicatesHint') }}
        </p>

        <DuplicatesTable
          :duplicates="store.duplicates"
          :unmarked-indices="store.unmarkedDuplicateIndices"
          @toggle="(rowIndex) => store.toggleDuplicateUnmark({ rowIndex })"
        />
      </section>

      <!-- Import error callout (execute API failure) -->
      <Callout v-if="store.executeError" variant="destructive" role="alert">
        <p>{{ store.executeError }}</p>
      </Callout>

      <!-- ==================== FOOTER ==================== -->
      <div class="flex items-center justify-between gap-3 pt-2">
        <UiButton variant="ghost" @click="store.goBack()">
          <ChevronLeftIcon class="size-4" />
          {{ $t('pages.importExport.msMoneyImport.review.back') }}
        </UiButton>

        <UiButton :disabled="isExecuting" @click="handleImport">
          <template v-if="isExecuting">
            <LoaderCircleIcon class="size-4 animate-spin" />
            {{ $t('pages.importExport.msMoneyImport.review.importing') }}
          </template>
          <template v-else>
            {{ $t('pages.importExport.msMoneyImport.review.importButton', { count: willImportCount }) }}
            <ChevronRightIcon class="size-4" />
          </template>
        </UiButton>
      </div>
    </template>
  </div>
</template>
