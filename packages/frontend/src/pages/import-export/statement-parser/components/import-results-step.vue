<template>
  <div class="space-y-6">
    <!-- Pre-import Summary (before importing) -->
    <template v-if="!store.importResult && !store.isImporting">
      <div class="space-y-4">
        <div>
          <h3 class="text-lg font-semibold">Ready to Import</h3>
          <p class="text-muted-foreground text-sm">
            Review the summary below and click "Import Transactions" to proceed.
          </p>
        </div>

        <div class="text-sm">
          <div class="flex items-center gap-2 py-1">
            <span class="text-muted-foreground">Account:</span>
            <span class="font-medium">{{ store.selectedAccount?.name }}</span>
            <span class="text-muted-foreground">({{ store.selectedAccount?.currencyCode }})</span>
          </div>
          <div class="flex items-center gap-2 py-1">
            <span class="text-muted-foreground">Transactions to import:</span>
            <span class="font-semibold text-green-600">{{ store.importSummary.toImport }}</span>
          </div>
          <div class="flex items-center gap-2 py-1">
            <span class="text-muted-foreground">Transactions to skip:</span>
            <span class="font-medium">{{ store.importSummary.total - store.importSummary.toImport }}</span>
          </div>
        </div>
      </div>

      <div class="flex gap-3">
        <Button variant="outline" @click="handleBack">
          <ArrowLeftIcon class="mr-2 size-4" />
          Back
        </Button>
        <Button class="flex-1" @click="handleImport" :disabled="store.importSummary.toImport === 0">
          Import {{ store.importSummary.toImport }} Transactions
        </Button>
      </div>
    </template>

    <!-- Importing State -->
    <div v-if="store.isImporting" class="flex flex-col items-center justify-center py-12">
      <Loader2Icon class="text-primary mb-4 size-12 animate-spin" />
      <h3 class="text-lg font-semibold">Importing Transactions</h3>
      <p class="text-muted-foreground mt-1 text-sm">Please wait while we import your transactions...</p>
    </div>

    <!-- Import Error -->
    <div v-if="store.importError" class="space-y-4">
      <div class="flex flex-col items-center justify-center py-8">
        <AlertCircleIcon class="mb-4 size-12 text-red-500" />
        <h3 class="text-lg font-semibold">Import Failed</h3>
        <p class="text-destructive-text mt-1 text-sm">{{ store.importError }}</p>
      </div>
      <div class="flex gap-3">
        <Button variant="outline" class="flex-1" @click="store.reset()">Start Over</Button>
        <Button class="flex-1" @click="handleImport">Try Again</Button>
      </div>
    </div>

    <!-- Import Success -->
    <template v-if="store.importResult">
      <div class="mb-6 text-center">
        <div
          :class="{
            'bg-success/40': hasNoErrors,
            'bg-yellow-100': hasErrors,
          }"
          class="mx-auto mb-4 flex size-16 items-center justify-center rounded-full"
        >
          <CheckCircleIcon v-if="hasNoErrors" class="text-success-text size-8" />
          <AlertCircleIcon v-else class="size-8 text-yellow-600" />
        </div>
        <h2 class="text-lg font-semibold">
          {{ hasNoErrors ? 'Import Complete!' : 'Import Completed with Issues' }}
        </h2>
        <p class="text-muted-foreground text-sm">
          {{
            hasNoErrors
              ? 'Your transactions have been successfully imported.'
              : 'Some transactions could not be imported.'
          }}
        </p>
      </div>

      <!-- Results Summary -->
      <div class="text-sm">
        <div class="flex items-center gap-2 py-1">
          <span class="text-muted-foreground">Imported:</span>
          <span class="font-semibold text-green-600">{{ store.importResult.summary.imported }}</span>
        </div>
        <div class="flex items-center gap-2 py-1">
          <span class="text-muted-foreground">Skipped:</span>
          <span class="font-semibold text-yellow-600">{{ store.importResult.summary.skipped }}</span>
        </div>
      </div>

      <!-- Errors Section -->
      <div v-if="store.importResult.summary.errors.length" class="space-y-2">
        <h3 class="text-destructive-text text-sm font-semibold">Import Errors</h3>
        <div class="max-h-48 overflow-auto rounded-lg border border-red-200">
          <table class="w-full text-sm">
            <thead class="bg-red-50">
              <tr>
                <th class="border-b px-4 py-2 text-left font-medium">Transaction #</th>
                <th class="border-b px-4 py-2 text-left font-medium">Error</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="error in store.importResult.summary.errors"
                :key="error.transactionIndex"
                class="border-b last:border-b-0"
              >
                <td class="px-4 py-2 font-mono">{{ error.transactionIndex + 1 }}</td>
                <td class="text-destructive-text px-4 py-2">{{ error.error }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Batch ID -->
      <div class="bg-muted rounded-lg p-4">
        <p class="text-muted-foreground text-xs">
          Import Batch ID: <span class="font-mono">{{ store.importResult.batchId }}</span>
        </p>
        <p class="text-muted-foreground mt-1 text-xs">
          You can use this ID to find and manage all imported transactions.
        </p>
      </div>

      <!-- Action Buttons -->
      <div class="flex justify-center gap-4">
        <Button variant="outline" @click="handleViewTransactions">View Transactions</Button>
        <Button @click="store.reset()">Start New Import</Button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { Button } from '@/components/lib/ui/button';
import { useStatementParserStore } from '@/stores/statement-parser';
import { AlertCircleIcon, ArrowLeftIcon, CheckCircleIcon, Loader2Icon } from 'lucide-vue-next';
import { computed } from 'vue';
import { useRouter } from 'vue-router';

const store = useStatementParserStore();
const router = useRouter();

const hasNoErrors = computed(() => {
  return store.importResult?.summary.errors.length === 0;
});

const hasErrors = computed(() => {
  return (store.importResult?.summary.errors.length ?? 0) > 0;
});

function handleBack() {
  // Go back to step 3 (review) for existing accounts, or step 2 (account selection) for new accounts
  store.goBackToStep({ step: store.isNewAccount ? 2 : 3 });
}

async function handleImport() {
  await store.executeImport();
}

function handleViewTransactions() {
  router.push('/transactions');
}
</script>
