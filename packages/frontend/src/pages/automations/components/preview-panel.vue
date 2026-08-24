<script setup lang="ts">
import CategoryCircle from '@/components/common/category-circle.vue';
import { Button } from '@/components/lib/ui/button';
import { usePreviewAutomation } from '@/composable/data-queries/transaction-automations';
import { extractApiErrorMessage } from '@/js/errors';
import { formatUIAmount } from '@/js/helpers';
import { useCategoriesStore } from '@/stores';
import { type AutomationConditions, TRANSACTION_TYPES } from '@bt/shared/types';
import { Loader2Icon, PlayIcon } from '@lucide/vue';
import { format } from 'date-fns';
import { storeToRefs } from 'pinia';
import { computed, ref } from 'vue';

const props = defineProps<{ conditions: AutomationConditions; disabled: boolean }>();

const { categoriesMap } = storeToRefs(useCategoriesStore());
const preview = usePreviewAutomation();

const lastRun = ref<string | null>(null);
const isStale = computed(() => lastRun.value !== null && lastRun.value !== JSON.stringify(props.conditions));

const run = () => {
  const snapshot = JSON.stringify(props.conditions);
  preview.mutate({ conditions: props.conditions }, { onSuccess: () => (lastRun.value = snapshot) });
};
</script>

<template>
  <div class="flex flex-col gap-3">
    <Button
      type="button"
      variant="outline"
      size="sm"
      class="self-start"
      :disabled="disabled || preview.isPending.value"
      @click="run"
    >
      <Loader2Icon v-if="preview.isPending.value" class="size-4 animate-spin" />
      <PlayIcon v-else class="size-4" />
      {{ $t('automations.editor.preview.run') }}
    </Button>

    <p v-if="disabled" class="text-muted-foreground text-xs">{{ $t('automations.editor.preview.hint') }}</p>

    <p v-if="preview.isError.value" class="text-destructive-text text-xs">
      {{ extractApiErrorMessage(preview.error.value) || $t('automations.editor.preview.error') }}
    </p>

    <template v-if="preview.data.value">
      <p v-if="isStale" class="text-warning-text text-xs">{{ $t('automations.editor.preview.stale') }}</p>

      <p class="text-muted-foreground text-xs">
        {{
          $t('automations.editor.preview.summary', {
            matched: preview.data.value.matchedCount,
            scanned: preview.data.value.scannedCount,
          })
        }}
      </p>

      <p v-if="preview.data.value.matches.length === 0" class="text-muted-foreground text-xs">
        {{ $t('automations.editor.preview.empty') }}
      </p>

      <div v-else class="flex flex-col gap-2">
        <div v-for="match in preview.data.value.matches" :key="match.id" class="flex items-center gap-2 text-sm">
          <CategoryCircle :category-id="match.categoryId" />
          <span class="min-w-0 flex-1 truncate">
            {{ match.note || categoriesMap[match.categoryId]?.name || '—' }}
          </span>
          <span
            class="text-amount shrink-0 text-xs"
            :class="
              match.transactionType === TRANSACTION_TYPES.income ? 'text-app-income-color' : 'text-app-expense-color'
            "
          >
            {{ formatUIAmount(match.amount, { currency: match.currencyCode }) }}
          </span>
          <span class="text-muted-foreground shrink-0 text-xs">{{ format(new Date(match.time), 'd MMM') }}</span>
        </div>
      </div>
    </template>
  </div>
</template>
