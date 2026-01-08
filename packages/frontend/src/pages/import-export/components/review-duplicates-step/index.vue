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
      <div class="max-h-64 overflow-auto rounded-lg border border-red-200">
        <table class="w-full text-sm">
          <thead class="bg-destructive">
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
      <h3 class="mb-3 text-sm font-semibold text-yellow-600">
        {{ t('pages.importExport.csvImport.review.duplicatesTitle', { count: importStore.importSummary.duplicates }) }}
      </h3>
      <p class="text-muted-foreground mb-3 text-xs">
        {{ t('pages.importExport.csvImport.review.duplicatesHint') }}
      </p>
      <div class="max-h-96 overflow-auto rounded-lg border border-yellow-200">
        <table class="w-full text-sm">
          <thead class="sticky top-0 bg-yellow-50">
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
                    'bg-green-100 text-green-700': dup.matchType === 'exact',
                    'bg-yellow-100 text-yellow-700': dup.matchType === 'fuzzy',
                  }"
                  class="rounded px-2 py-0.5 text-xs font-medium"
                >
                  {{ dup.matchType }} ({{ dup.confidence }}%)
                </span>
              </td>
              <td class="px-4 py-2">
                <div class="text-xs">
                  <p>{{ dup.importedTransaction.date }}</p>
                  <p class="font-medium">{{ formatAmount(dup.importedTransaction.amount) }}</p>
                  <p class="text-muted-foreground max-w-xs truncate">{{ dup.importedTransaction.description }}</p>
                </div>
              </td>
              <td class="px-4 py-2">
                <div class="text-xs">
                  <p>{{ dup.existingTransaction.date }}</p>
                  <p class="font-medium">{{ formatAmount(dup.existingTransaction.amount) }}</p>
                  <p class="text-muted-foreground max-w-xs truncate">{{ dup.existingTransaction.note }}</p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
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
      </p>
    </div>

    <!-- Action Buttons -->
    <div class="flex justify-between">
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
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const importStore = useImportExportStore();

const formatAmount = (amount: number): string => {
  // Amounts are stored in cents, convert to dollars
  return (amount / 100).toFixed(2);
};

const goBack = () => {
  importStore.currentStep = 2;
};

const handleExecuteImport = async () => {
  await importStore.executeImport();
};
</script>
