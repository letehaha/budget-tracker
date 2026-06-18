<template>
  <div class="bg-card rounded-lg border p-6">
    <div class="mb-4">
      <h2 class="text-lg font-semibold">{{ t('pages.importExport.csvImport.review.stepTitle') }}</h2>
      <p class="text-muted-foreground text-sm">{{ t('pages.importExport.csvImport.review.description') }}</p>
    </div>

    <!-- Summary Cards -->
    <div class="mb-6 grid gap-4 md:grid-cols-4">
      <div class="bg-muted rounded-lg p-4">
        <p class="text-muted-foreground text-sm">{{ t('pages.importExport.csvImport.review.totalRows') }}</p>
        <p class="text-2xl font-bold">{{ importStore.importSummary.totalRows }}</p>
      </div>
      <div class="rounded-lg bg-green-500/10 p-4">
        <p class="text-sm text-green-600">{{ t('pages.importExport.csvImport.review.validRows') }}</p>
        <p class="text-2xl font-bold text-green-600">{{ importStore.importSummary.validRows }}</p>
      </div>
      <div class="rounded-lg bg-red-500/10 p-4">
        <p class="text-destructive-text text-sm">{{ t('pages.importExport.csvImport.review.invalidRows') }}</p>
        <p class="text-destructive-text text-2xl font-bold">{{ importStore.importSummary.invalidRows }}</p>
      </div>
      <div class="rounded-lg bg-yellow-500/10 p-4">
        <p class="text-sm text-yellow-600">{{ t('pages.importExport.csvImport.review.duplicates') }}</p>
        <p class="text-2xl font-bold text-yellow-600">{{ importStore.importSummary.duplicates }}</p>
      </div>
    </div>

    <!-- Invalid Rows Section -->
    <div v-if="importStore.invalidRows.length > 0" class="mb-6">
      <h3 class="text-destructive-text mb-3 text-sm font-semibold">
        {{ t('pages.importExport.csvImport.review.invalidRowsTitle') }}
      </h3>
      <div class="border-destructive/30 max-h-64 overflow-auto rounded-lg border">
        <table class="w-full text-sm">
          <thead class="bg-muted">
            <tr>
              <th class="border-b px-4 py-2 text-left font-medium">
                {{ t('pages.importExport.csvImport.review.rowNumber') }}
              </th>
              <th class="border-b px-4 py-2 text-left font-medium">
                {{ t('pages.importExport.csvImport.review.errors') }}
              </th>
              <th class="border-b px-4 py-2 text-left font-medium">
                {{ t('pages.importExport.csvImport.review.rawData') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in importStore.invalidRows" :key="row.rowIndex" class="border-b last:border-b-0">
              <td class="px-4 py-2 font-mono">{{ row.rowIndex }}</td>
              <td class="px-4 py-2">
                <ul class="text-destructive-text list-inside list-disc">
                  <li v-for="(error, idx) in row.errors" :key="idx">{{ error }}</li>
                </ul>
              </td>
              <td class="max-w-xs truncate px-4 py-2 text-xs">
                {{ JSON.stringify(row.rawData) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Duplicates Section -->
    <div v-if="importStore.duplicates.length > 0" class="mb-6">
      <h3 class="text-warning-text mb-3 text-sm font-semibold">
        {{ t('pages.importExport.csvImport.review.duplicatesTitle', { count: importStore.importSummary.duplicates }) }}
      </h3>
      <p class="text-muted-foreground mb-3 text-xs">
        {{ t('pages.importExport.csvImport.review.duplicatesHint') }}
      </p>
      <div class="border-warning/30 max-h-96 overflow-auto rounded-lg border">
        <table class="w-full text-sm">
          <thead class="bg-muted sticky top-0">
            <tr>
              <th class="border-b px-4 py-2 text-left font-medium">
                {{ t('pages.importExport.csvImport.review.skip') }}
              </th>
              <th class="border-b px-4 py-2 text-left font-medium">
                {{ t('pages.importExport.csvImport.review.rowNumber') }}
              </th>
              <th class="border-b px-4 py-2 text-left font-medium">
                {{ t('pages.importExport.csvImport.review.match') }}
              </th>
              <th class="border-b px-4 py-2 text-left font-medium">
                {{ t('pages.importExport.csvImport.review.csvTransaction') }}
              </th>
              <th class="border-b px-4 py-2 text-left font-medium">
                {{ t('pages.importExport.csvImport.review.existingTransaction') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="dup in importStore.duplicates" :key="dup.rowIndex" class="border-b last:border-b-0">
              <td class="px-4 py-2">
                <input
                  type="checkbox"
                  :checked="!importStore.unmarkedDuplicateIndices.has(dup.rowIndex)"
                  @change="importStore.toggleDuplicateUnmark(dup.rowIndex)"
                  class="size-4 rounded border-gray-300"
                />
              </td>
              <td class="px-4 py-2 font-mono">{{ dup.rowIndex }}</td>
              <td class="px-4 py-2">
                <span
                  :class="{
                    'bg-success/10 text-success-text': dup.matchType === 'exact',
                    'bg-warning/10 text-warning-text': dup.matchType === 'fuzzy',
                  }"
                  class="rounded px-2 py-0.5 text-xs font-medium"
                >
                  {{ dup.matchType }} ({{ dup.confidence }}%)
                </span>
              </td>
              <td class="px-4 py-2">
                <div class="text-xs">
                  <p>{{ formatDate(dup.importedTransaction.date) }}</p>
                  <p class="font-medium">{{ formatAmount(dup.importedTransaction.amount) }}</p>
                  <p class="text-muted-foreground max-w-xs truncate">{{ dup.importedTransaction.description }}</p>
                </div>
              </td>
              <td class="px-4 py-2">
                <div class="text-xs">
                  <p>{{ formatDate(dup.existingTransaction.date) }}</p>
                  <p class="font-medium">{{ formatAmount(dup.existingTransaction.amount) }}</p>
                  <p class="text-muted-foreground max-w-xs truncate">{{ dup.existingTransaction.note }}</p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Unpriceable Rows Section -->
    <!-- Shown when at least one row's currency has no stored exchange rate.
         The user must explicitly skip those rows or abort — silent import is not allowed. -->
    <div
      v-if="importStore.unpriceableRows.length > 0"
      class="border-warning/30 bg-warning/5 mb-6 rounded-lg border p-4"
      role="alert"
    >
      <div class="mb-2 flex items-start gap-2">
        <AlertTriangleIcon class="text-warning mt-0.5 size-5 shrink-0" />
        <div>
          <h3 class="text-warning-text text-sm font-semibold">
            {{
              t('pages.importExport.csvImport.review.unpriceableTitle', {
                count: importStore.unpriceableRows.length,
              })
            }}
          </h3>
          <p class="text-warning-text mt-1 text-xs opacity-80">
            {{ t('pages.importExport.csvImport.review.unpriceableDescription') }}
          </p>
        </div>
      </div>

      <div class="border-warning/30 mt-3 max-h-48 overflow-auto rounded border">
        <table class="w-full text-sm">
          <thead class="bg-muted sticky top-0">
            <tr>
              <th class="text-warning-text border-b px-4 py-2 text-left font-medium">
                {{ t('pages.importExport.csvImport.review.rowNumber') }}
              </th>
              <th class="text-warning-text border-b px-4 py-2 text-left font-medium">
                {{ t('pages.importExport.csvImport.review.currency') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in importStore.unpriceableRows" :key="row.rowIndex" class="border-b last:border-b-0">
              <td class="text-warning-text px-4 py-2 font-mono">{{ row.rowIndex }}</td>
              <td class="text-warning-text px-4 py-2 font-medium">{{ row.currencyCode }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Skip-or-Abort choice — always visible when unpriceableRows is non-empty -->
      <div class="mt-4 flex flex-wrap gap-3">
        <UiButton variant="default" :disabled="importStore.importInProgress" @click="handleSkipAndImport">
          {{ t('pages.importExport.csvImport.review.skipAndImport') }}
        </UiButton>
        <UiButton variant="outline" @click="goBack">
          {{ t('pages.importExport.csvImport.review.cancelImport') }}
        </UiButton>
      </div>
    </div>

    <!-- Import Summary -->
    <div class="bg-primary/10 border-primary mb-6 rounded-lg border p-4">
      <h3 class="mb-2 text-sm font-semibold">{{ t('pages.importExport.csvImport.review.importSummary') }}</h3>
      <p class="text-sm">
        <span class="font-bold text-green-600">{{ importStore.importSummary.willImport }}</span>
        {{ t('pages.importExport.csvImport.review.willBeImported') }}
        <span v-if="importStore.importSummary.invalidRows > 0">
          <span class="text-destructive-text font-bold">{{ importStore.importSummary.invalidRows }}</span>
          {{ t('pages.importExport.csvImport.review.invalidWillBeSkipped') }}
        </span>
        <span v-if="importStore.importSummary.duplicates > 0">
          <span class="font-bold text-yellow-600">{{ importStore.importSummary.duplicates }}</span>
          {{ t('pages.importExport.csvImport.review.duplicatesWillBeSkipped') }}
        </span>
        <span v-if="importStore.unpriceableRows.length > 0">
          <span class="font-bold text-orange-600">{{ importStore.unpriceableRows.length }}</span>
          {{ t('pages.importExport.csvImport.review.unpriceableWillBeSkipped') }}
        </span>
      </p>
    </div>

    <!-- Action Buttons — hidden when unpriceableRows consent panel is active,
         because the consent panel carries its own Skip/Cancel controls. -->
    <div v-if="importStore.unpriceableRows.length === 0" class="flex justify-between">
      <UiButton variant="outline" @click="goBack">
        <ChevronLeftIcon class="mr-2 size-4" />
        {{ t('pages.importExport.csvImport.review.backToMapping') }}
      </UiButton>
      <UiButton
        @click="handleExecuteImport"
        :disabled="importStore.importSummary.willImport === 0 || importStore.importInProgress"
      >
        <template v-if="importStore.importInProgress">{{
          t('pages.importExport.csvImport.review.importing')
        }}</template>
        <template v-else>
          {{ t('pages.importExport.csvImport.review.importButton', { count: importStore.importSummary.willImport }) }}
          <ChevronRightIcon class="ml-2 size-4" />
        </template>
      </UiButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import UiButton from '@/components/lib/ui/button/Button.vue';
import { useImportExportStore } from '@/stores/import-export';
import { AlertTriangleIcon, ChevronLeftIcon, ChevronRightIcon } from '@lucide/vue';
import { format, parseISO } from 'date-fns';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const importStore = useImportExportStore();

const formatAmount = (amount: number): string => {
  // Amounts are stored in cents, convert to dollars
  return (amount / 100).toFixed(2);
};

/**
 * Formats any ISO date string (full instant or YYYY-MM-DD) into a locale-aware
 * display date. Using parseISO handles both formats; format() renders in the
 * user's local timezone so the day matches what the rest of the app shows.
 */
const formatDate = (iso: string): string => format(parseISO(iso), 'PP');

const goBack = () => {
  importStore.currentStep = 2;
};

const handleExecuteImport = async () => {
  await importStore.executeImport();
};

/** Skip path: pass all unpriceable row indices so the backend skips them. */
const handleSkipAndImport = async () => {
  const skipUnpriceableIndices = importStore.unpriceableRows.map((r) => r.rowIndex);
  await importStore.executeImport({ skipUnpriceableIndices });
};
</script>
