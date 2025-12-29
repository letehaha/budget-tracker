<template>
  <div v-if="isLoadingModels" class="text-muted-foreground flex items-center gap-2 py-4 text-sm">
    <Loader2Icon class="size-4 animate-spin" />
    Loading models...
  </div>

  <ModelSelectorCard
    v-else
    :feature-status="featureStatus"
    :grouped-models="groupedModels"
    :available-models="availableModels"
    :tokens-per-transaction="TOKENS_PER_TRANSACTION"
    :default-open="defaultOpen"
  >
    <template #before-selector>
      <!-- Model selection hint specific to categorization -->
      <div class="mb-4">
        <button
          type="button"
          class="text-primary flex items-center gap-1 text-xs hover:underline"
          @click="showModelHint = !showModelHint"
        >
          <LightbulbIcon class="size-3" />
          What model should I choose?
          <ChevronDownIcon class="size-3 transition-transform" :class="{ 'rotate-180': showModelHint }" />
        </button>
        <p v-if="showModelHint" class="bg-muted/50 text-muted-foreground mt-2 rounded-md p-2 text-xs">
          For transaction categorization, <strong>low-cost models</strong> like Gemini Flash, Claude Haiku, or GPT-4o
          Mini are recommended. Categorization is a straightforward task that doesn't require expensive reasoning
          models. Using cheaper models lets you process more transactions at lower cost.
        </p>
      </div>
    </template>

    <template #after-card>
      <!-- How it works for categorization -->
      <div class="mt-4 border-t pt-4">
        <h5 class="mb-2 text-sm font-medium">How it works</h5>
        <ul class="text-muted-foreground list-disc space-y-1.5 pl-5 text-xs leading-relaxed">
          <li>
            When you sync transactions from your bank, uncategorized transactions are automatically sent to AI for
            categorization.
          </li>
          <li>
            The AI analyzes transaction descriptions and merchant names to suggest appropriate categories from your
            existing category list.
          </li>
          <li>You can always manually override AI-suggested categories.</li>
        </ul>
      </div>
    </template>
  </ModelSelectorCard>
</template>

<script setup lang="ts">
import { useFeatureModels } from '@/composable/data-queries/use-feature-models';
import { AIFeatureStatus, AI_FEATURE } from '@bt/shared/types';
import { ChevronDownIcon, LightbulbIcon, Loader2Icon } from 'lucide-vue-next';
import { ref } from 'vue';

import ModelSelectorCard from '../shared/model-selector-card.vue';

defineProps<{
  featureStatus: AIFeatureStatus;
  defaultOpen?: boolean;
}>();

/**
 * Token estimates for categorization:
 * - ~250 input tokens per transaction (description + category list)
 * - ~30 output tokens per transaction (category name)
 */
const TOKENS_PER_TRANSACTION = { input: 250, output: 30 };

const showModelHint = ref(false);

// Fetch models with recommendations specific to categorization
const { availableModels, groupedModels, isLoading: isLoadingModels } = useFeatureModels(AI_FEATURE.categorization);
</script>
