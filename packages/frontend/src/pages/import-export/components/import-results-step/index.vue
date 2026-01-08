<template>
  <div class="bg-card rounded-lg border p-6">
    <div class="mb-6 text-center">
      <div
        :class="{
          'bg-green-100': hasNoErrors,
          'bg-yellow-100': hasErrors,
        }"
        class="mx-auto mb-4 flex size-16 items-center justify-center rounded-full"
      >
        <CheckCircleIcon v-if="hasNoErrors" class="size-8 text-green-600" />
        <AlertCircleIcon v-else class="size-8 text-yellow-600" />
      </div>
      <h2 class="text-lg font-semibold">
        {{
          hasNoErrors
            ? t('pages.importExport.csvImport.results.completeTitle')
            : t('pages.importExport.csvImport.results.completeWithIssuesTitle')
        }}
      </h2>
      <p class="text-muted-foreground text-sm">
        {{
          hasNoErrors
            ? t('pages.importExport.csvImport.results.successDescription')
            : t('pages.importExport.csvImport.results.partialDescription')
        }}
      </p>
    </div>

    <!-- Results Summary -->
    <div v-if="importStore.importResult" class="mb-6 grid gap-4 md:grid-cols-4">
      <div class="rounded-lg bg-green-500/10 p-4 text-center">
        <p class="text-sm text-green-600">{{ t('pages.importExport.csvImport.results.imported') }}</p>
        <p class="text-3xl font-bold text-green-600">{{ importStore.importResult.summary.imported }}</p>
      </div>
      <div class="rounded-lg bg-yellow-500/10 p-4 text-center">
        <p class="text-sm text-yellow-600">{{ t('pages.importExport.csvImport.results.skippedDuplicates') }}</p>
        <p class="text-3xl font-bold text-yellow-600">{{ importStore.importResult.summary.skipped }}</p>
      </div>
      <div class="rounded-lg bg-blue-500/10 p-4 text-center">
        <p class="text-sm text-blue-600">{{ t('pages.importExport.csvImport.results.accountsCreated') }}</p>
        <p class="text-3xl font-bold text-blue-600">{{ importStore.importResult.summary.accountsCreated }}</p>
      </div>
      <div class="rounded-lg bg-purple-500/10 p-4 text-center">
        <p class="text-sm text-purple-600">{{ t('pages.importExport.csvImport.results.categoriesCreated') }}</p>
        <p class="text-3xl font-bold text-purple-600">{{ importStore.importResult.summary.categoriesCreated }}</p>
      </div>
    </div>

    <!-- Errors Section -->
    <div v-if="importStore.importResult?.summary.errors.length" class="mb-6">
      <h3 class="text-destructive-text mb-3 text-sm font-semibold">
        {{ t('pages.importExport.csvImport.results.importErrors') }}
      </h3>
      <div class="max-h-48 overflow-auto rounded-lg border border-red-200">
        <table class="w-full text-sm">
          <thead class="bg-red-50">
            <tr>
              <th class="border-b px-4 py-2 text-left font-medium">
                {{ t('pages.importExport.csvImport.results.rowNumber') }}
              </th>
              <th class="border-b px-4 py-2 text-left font-medium">
                {{ t('pages.importExport.csvImport.results.error') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="error in importStore.importResult.summary.errors"
              :key="error.rowIndex"
              class="border-b last:border-b-0"
            >
              <td class="px-4 py-2 font-mono">{{ error.rowIndex }}</td>
              <td class="text-destructive-text px-4 py-2">{{ error.error }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Batch ID -->
    <div v-if="importStore.importResult" class="bg-muted mb-6 rounded-lg p-4">
      <p class="text-muted-foreground text-xs">
        {{ t('pages.importExport.csvImport.results.batchIdLabel') }}:
        <span class="font-mono">{{ importStore.importResult.batchId }}</span>
      </p>
      <p class="text-muted-foreground mt-1 text-xs">
        {{ t('pages.importExport.csvImport.results.batchIdDescription') }}
      </p>
    </div>

    <!-- Action Buttons -->
    <div class="flex justify-center gap-4">
      <UiButton variant="outline" @click="handleViewTransactions">{{
        t('pages.importExport.csvImport.results.viewTransactions')
      }}</UiButton>
      <UiButton @click="handleNewImport">{{ t('pages.importExport.csvImport.results.startNewImport') }}</UiButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import UiButton from '@/components/lib/ui/button/Button.vue';
import { useImportExportStore } from '@/stores/import-export';
import { AlertCircleIcon, CheckCircleIcon } from 'lucide-vue-next';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

const { t } = useI18n();

const importStore = useImportExportStore();
const router = useRouter();

const hasNoErrors = computed(() => {
  return importStore.importResult?.summary.errors.length === 0;
});

const hasErrors = computed(() => {
  return (importStore.importResult?.summary.errors.length ?? 0) > 0;
});

const handleViewTransactions = () => {
  router.push('/transactions');
};

const handleNewImport = () => {
  importStore.reset();
};
</script>
