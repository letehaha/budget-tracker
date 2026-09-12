<script setup lang="ts">
import { Button } from '@/components/lib/ui/button';
import TransactionRecord from '@/components/transactions-list/transaction-record.vue';
import { usePreviewAutomation } from '@/composable/data-queries/transaction-automations';
import { extractApiErrorMessage } from '@/js/errors';
import type { AutomationConditions } from '@bt/shared/types';
import { Loader2Icon, PlayIcon } from '@lucide/vue';
import { computed, ref } from 'vue';

const props = defineProps<{ conditions: AutomationConditions; disabled: boolean }>();

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
        <TransactionRecord v-for="tx in preview.data.value.matches" :key="tx.id" :tx="tx" compact />
      </div>
    </template>
  </div>
</template>
