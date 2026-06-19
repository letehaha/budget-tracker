<template>
  <div class="space-y-6">
    <!-- Success / partial-success header -->
    <div class="text-center">
      <div
        :class="
          cn(
            'mx-auto mb-4 flex size-16 items-center justify-center rounded-full',
            hasRowErrors ? 'bg-warning/10' : 'bg-success/10',
          )
        "
      >
        <CircleCheckIcon v-if="!hasRowErrors" class="text-success-text size-8" />
        <CircleAlertIcon v-else class="text-warning-text size-8" />
      </div>

      <h2 class="text-lg font-semibold">
        {{
          hasRowErrors
            ? $t('pages.importExport.csvImport.results.completeWithIssuesTitle')
            : $t('pages.importExport.csvImport.results.completeTitle')
        }}
      </h2>
      <p class="text-muted-foreground mt-1 text-sm">
        {{
          hasRowErrors
            ? $t('pages.importExport.csvImport.results.partialDescription')
            : $t('pages.importExport.csvImport.results.successDescription')
        }}
      </p>
    </div>

    <!-- Success callout -->
    <Callout v-if="!hasRowErrors && store.importResult" variant="success">
      <p>
        {{
          $t('pages.importExport.csvImport.results.successCallout', {
            count: store.importResult.summary.imported,
          })
        }}
      </p>
    </Callout>

    <!-- Import error callout (API-level failure) -->
    <Callout v-if="store.importError" variant="destructive" role="alert">
      <p>{{ store.importError }}</p>
    </Callout>

    <!-- Stat cards — 3-up primary summary -->
    <div v-if="store.importResult" class="@container/result-stats">
      <div class="grid grid-cols-1 gap-3 @sm/result-stats:grid-cols-3">
        <StatCard
          :label="$t('pages.importExport.csvImport.results.imported')"
          :value="store.importResult.summary.imported"
          variant="success"
        />
        <StatCard
          :label="$t('pages.importExport.csvImport.results.skippedDuplicates')"
          :value="store.importResult.summary.skipped"
          variant="neutral"
        />
        <StatCard
          :label="$t('pages.importExport.csvImport.results.failed')"
          :value="store.importResult.summary.errors.length"
          :variant="store.importResult.summary.errors.length > 0 ? 'destructive' : 'neutral'"
        />
      </div>

      <!-- Secondary stats: unpriceable skipped + entities created -->
      <div v-if="hasSecondaryStats" class="mt-3 grid grid-cols-2 gap-3 @sm/result-stats:grid-cols-4">
        <StatCard
          v-if="store.importResult.summary.skippedUnpriceable > 0"
          :label="$t('pages.importExport.csvImport.results.skippedUnpriceable')"
          :value="store.importResult.summary.skippedUnpriceable"
          variant="warning"
        />
        <StatCard
          v-if="store.importResult.summary.accountsCreated > 0"
          :label="$t('pages.importExport.csvImport.results.accountsCreated')"
          :value="store.importResult.summary.accountsCreated"
          variant="neutral"
        />
        <StatCard
          v-if="store.importResult.summary.categoriesCreated > 0"
          :label="$t('pages.importExport.csvImport.results.categoriesCreated')"
          :value="store.importResult.summary.categoriesCreated"
          variant="neutral"
        />
        <StatCard
          v-if="store.importResult.summary.tagsCreated > 0"
          :label="$t('pages.importExport.csvImport.results.tagsCreated')"
          :value="store.importResult.summary.tagsCreated"
          variant="neutral"
        />
      </div>
    </div>

    <!-- Per-row errors table -->
    <section v-if="store.importResult?.summary.errors.length" aria-labelledby="result-errors-heading">
      <h3 id="result-errors-heading" class="text-destructive-text mb-3 text-sm font-semibold">
        {{ $t('pages.importExport.csvImport.results.importErrors') }}
      </h3>

      <MappingTable :columns="errorColumns" :items="store.importResult.summary.errors" :row-key="(err) => err.rowIndex">
        <template #cell:row="{ item }">
          <span class="text-muted-foreground font-mono text-xs">#{{ item.rowIndex }}</span>
        </template>

        <template #cell:problem="{ item }">
          <div class="flex items-start gap-1.5">
            <StatusIndicator status="invalid" size="xs" class="mt-px shrink-0" />
            <span class="text-destructive-text text-xs leading-snug">{{ item.error }}</span>
          </div>
        </template>

        <template #empty>
          {{ $t('pages.importExport.csvImport.results.noErrors') }}
        </template>
      </MappingTable>
    </section>

    <!-- Batch ID reference -->
    <div v-if="store.importResult?.batchId" class="bg-muted/30 border-border rounded-lg border px-4 py-3">
      <p class="text-muted-foreground text-xs">
        {{ $t('pages.importExport.csvImport.results.batchIdLabel') }}:
        <span class="font-mono">{{ store.importResult.batchId }}</span>
      </p>
      <p class="text-muted-foreground mt-1 text-xs opacity-70">
        {{ $t('pages.importExport.csvImport.results.batchIdDescription') }}
      </p>
    </div>

    <!-- Action buttons -->
    <div class="flex flex-wrap justify-center gap-3 pt-2">
      <UiButton variant="outline" @click="handleViewTransactions">
        {{ $t('pages.importExport.csvImport.results.viewTransactions') }}
      </UiButton>
      <UiButton @click="handleNewImport">
        {{ $t('pages.importExport.csvImport.results.startNewImport') }}
      </UiButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Callout } from '@/components/lib/ui/callout';
import { MappingTable, type MappingTableColumn } from '@/components/lib/ui/mapping-table';
import { StatCard } from '@/components/lib/ui/stat-card';
import { StatusIndicator } from '@/components/lib/ui/status-indicator';
import { cn } from '@/lib/utils';
import { ROUTES_NAMES } from '@/routes/constants';
import { useImportExportStore } from '@/stores/import-export';
import { CircleAlertIcon, CircleCheckIcon } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

const { t } = useI18n();
const store = useImportExportStore();
const router = useRouter();

const hasRowErrors = computed(() => (store.importResult?.summary.errors.length ?? 0) > 0);

/**
 * Show the secondary stat row only when at least one secondary counter is
 * non-zero — avoids a row of all-zero cards on a clean import.
 */
const hasSecondaryStats = computed(() => {
  const s = store.importResult?.summary;
  if (!s) return false;
  return s.skippedUnpriceable > 0 || s.accountsCreated > 0 || s.categoriesCreated > 0 || s.tagsCreated > 0;
});

const errorColumns = computed<MappingTableColumn[]>(() => [
  { key: 'row', label: t('pages.importExport.importResults.errorColumns.row'), width: '48px' },
  { key: 'problem', label: t('pages.importExport.importResults.errorColumns.error'), width: 'minmax(0,1fr)' },
]);

const handleViewTransactions = () => {
  // Deep-link to the batch when the result carries a batchId. The transactions
  // route doesn't currently support a batch filter via query param, so we
  // navigate to the transactions list directly.
  router.push({ name: ROUTES_NAMES.transactions });
};

const handleNewImport = () => {
  store.reset();
};
</script>
