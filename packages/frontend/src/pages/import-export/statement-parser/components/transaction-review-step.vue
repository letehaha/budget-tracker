<template>
  <div class="space-y-6">
    <!-- Loading State -->
    <div v-if="store.isDetectingDuplicates" class="flex items-center justify-center py-8">
      <Loader2Icon class="text-primary mr-2 size-6 animate-spin" />
      <span>Checking for duplicates...</span>
    </div>

    <template v-else>
      <!-- Summary Stats -->
      <div class="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <div class="flex items-center gap-2">
          <span class="text-muted-foreground">Total:</span>
          <span class="font-semibold">{{ store.importSummary.total }}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-muted-foreground">Potential Duplicates:</span>
          <span class="font-semibold text-yellow-600">{{ store.importSummary.duplicates }}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-muted-foreground">Will Import:</span>
          <span class="font-semibold text-green-600">{{ store.importSummary.toImport }}</span>
        </div>
      </div>

      <!-- Transaction Timeline -->
      <div class="space-y-1">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-medium">Transaction Timeline</h3>
          <div class="flex items-center gap-3 text-xs">
            <div class="flex items-center gap-1">
              <div class="size-2 rounded-full bg-green-500/20 ring-1 ring-green-500"></div>
              <span class="text-muted-foreground">New</span>
            </div>
            <div class="flex items-center gap-1">
              <div class="size-2 rounded-full bg-yellow-500/20 ring-1 ring-yellow-500"></div>
              <span class="text-muted-foreground">Duplicate</span>
            </div>
            <div class="flex items-center gap-1">
              <div class="size-2 rounded-full bg-gray-500/20 ring-1 ring-gray-500"></div>
              <span class="text-muted-foreground">Existing</span>
            </div>
          </div>
        </div>

        <div class="max-h-80 overflow-auto rounded-lg border">
          <div class="min-w-max">
            <div
              v-for="(item, index) in timelineItems"
              :key="`${item.type}-${index}`"
              class="border-b last:border-b-0"
              :class="[
                item.type === 'new' && !item.isExcluded && 'bg-green-500/5',
                item.type === 'duplicate' && 'bg-yellow-500/5',
                item.type === 'existing' && 'bg-muted/50',
                item.isExcluded && 'opacity-50',
                item.type !== 'existing' && 'hover:bg-muted/30 cursor-pointer',
              ]"
              @click="handleRowClick(item)"
            >
              <div class="flex items-center gap-2 px-2 py-1.5">
                <!-- Status Indicator -->
                <div
                  class="size-2 shrink-0 rounded-full ring-1"
                  :class="{
                    'bg-green-500/20 ring-green-500': item.type === 'new',
                    'bg-yellow-500/20 ring-yellow-500': item.type === 'duplicate',
                    'bg-gray-500/20 ring-gray-500': item.type === 'existing',
                  }"
                ></div>

                <!-- Date -->
                <span class="text-muted-foreground w-20 shrink-0 text-xs">{{ item.date }}</span>

                <!-- Type Badge -->
                <span
                  class="w-16 shrink-0 rounded px-1 py-0.5 text-center text-xs"
                  :class="{
                    'bg-green-500/20 text-green-700': item.txType === 'income',
                    'bg-destructive/20 text-destructive-text': item.txType === 'expense',
                  }"
                >
                  {{ item.txType }}
                </span>

                <!-- Description -->
                <span class="min-w-0 flex-1 truncate text-xs">{{ item.description }}</span>

                <!-- Duplicate Badge -->
                <span
                  v-if="item.type === 'duplicate'"
                  class="shrink-0 rounded bg-yellow-500/20 px-1 py-0.5 text-xs text-yellow-700"
                >
                  Dup
                </span>

                <!-- Amount -->
                <span class="w-24 shrink-0 text-right font-mono text-xs font-medium">
                  {{ item.txType === 'expense' ? '-' : '+' }}{{ item.amount.toFixed(2) }}
                </span>

                <!-- Action Icon -->
                <div class="w-6 shrink-0 text-center">
                  <template v-if="item.type === 'new'">
                    <PlusCircleIcon v-if="item.isExcluded" class="inline size-3.5" />
                    <MinusCircleIcon v-else class="text-destructive-text inline size-3.5" />
                  </template>
                  <template v-else-if="item.type === 'duplicate'">
                    <XCircleIcon v-if="item.isOverridden" class="inline size-3.5 text-yellow-600" />
                    <CheckCircleIcon v-else class="inline size-3.5 text-green-600" />
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Duplicate Action Info -->
      <div v-if="store.duplicates.length > 0" class="bg-muted/50 rounded-lg p-4 text-sm">
        <p class="text-muted-foreground">
          <strong>{{ store.importSummary.duplicates - store.importSummary.overridden }}</strong> transactions will be
          skipped as duplicates.
          <span v-if="store.importSummary.overridden > 0">
            <strong>{{ store.importSummary.overridden }}</strong> duplicates have been overridden and will be imported.
          </span>
        </p>
        <p class="text-muted-foreground mt-1">
          Click the <CheckCircleIcon class="inline size-4 text-green-600" /> button to import a duplicate anyway, or
          <XCircleIcon class="inline size-4 text-yellow-600" /> to skip it.
        </p>
      </div>

      <!-- Navigation Buttons -->
      <div class="flex gap-3">
        <Button variant="outline" @click="handleBack">
          <ArrowLeftIcon class="mr-2 size-4" />
          Back
        </Button>
        <Button class="flex-1" @click="handleProceed" :disabled="store.importSummary.toImport === 0">
          Continue to Import <span class="max-sm:hidden"> ({{ store.importSummary.toImport }} transactions) </span>
        </Button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { Button } from '@/components/lib/ui/button';
import { useStatementParserStore } from '@/stores/statement-parser';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  Loader2Icon,
  MinusCircleIcon,
  PlusCircleIcon,
  XCircleIcon,
} from 'lucide-vue-next';
import { computed } from 'vue';

const store = useStatementParserStore();

interface TimelineItem {
  type: 'new' | 'duplicate' | 'existing';
  transactionIndex: number;
  date: string;
  description: string;
  amount: number;
  txType: 'income' | 'expense';
  existingNote?: string;
  isExcluded?: boolean;
  isOverridden?: boolean;
}

const timelineItems = computed((): TimelineItem[] => {
  if (!store.extractionResult) return [];

  const items: TimelineItem[] = [];
  const duplicateMap = new Map(store.duplicates.map((d) => [d.transactionIndex, d]));

  // Add extracted transactions
  store.extractionResult.transactions.forEach((tx, index) => {
    const duplicate = duplicateMap.get(index);
    const isExcluded = store.excludedTransactionIndices.has(index);
    const isOverridden = store.overriddenDuplicateIndices.has(index);

    if (duplicate) {
      items.push({
        type: 'duplicate',
        transactionIndex: index,
        date: tx.date.split(' ')[0]!,
        description: tx.description,
        amount: tx.amount,
        txType: tx.type,
        existingNote: duplicate.existingTransaction.note,
        isOverridden,
      });
    } else {
      items.push({
        type: 'new',
        transactionIndex: index,
        date: tx.date.split(' ')[0]!,
        description: tx.description,
        amount: tx.amount,
        txType: tx.type,
        isExcluded,
      });
    }
  });

  // Sort by date (newest first)
  items.sort((a, b) => b.date.localeCompare(a.date));

  return items;
});

function handleRowClick(item: TimelineItem) {
  if (item.type === 'new') {
    store.toggleTransactionExclusion({ transactionIndex: item.transactionIndex });
  } else if (item.type === 'duplicate') {
    store.toggleDuplicateOverride({ transactionIndex: item.transactionIndex });
  }
}

function handleBack() {
  store.goToStep({ step: 2 });
}

function handleProceed() {
  store.proceedToImport();
}
</script>
