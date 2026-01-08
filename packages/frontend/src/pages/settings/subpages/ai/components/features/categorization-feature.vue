<template>
  <div v-if="isLoadingModels" class="text-muted-foreground flex items-center gap-2 py-4 text-sm">
    <Loader2Icon class="size-4 animate-spin" />
    {{ $t('settings.ai.categorization.loading') }}
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
          {{ $t('settings.ai.categorization.modelHint.trigger') }}
          <ChevronDownIcon class="size-3 transition-transform" :class="{ 'rotate-180': showModelHint }" />
        </button>
        <p v-if="showModelHint" class="bg-muted/50 text-muted-foreground mt-2 rounded-md p-2 text-xs">
          {{ $t('settings.ai.categorization.modelHint.text') }}
        </p>
      </div>
    </template>

    <template #after-card>
      <!-- How it works for categorization -->
      <div class="mt-4 border-t pt-4">
        <h5 class="mb-2 text-sm font-medium">{{ $t('settings.ai.categorization.howItWorks.title') }}</h5>
        <ul class="text-muted-foreground list-disc space-y-1.5 pl-5 text-xs leading-relaxed">
          <li>{{ $t('settings.ai.categorization.howItWorks.points.autoSync') }}</li>
          <li>{{ $t('settings.ai.categorization.howItWorks.points.analysis') }}</li>
          <li>{{ $t('settings.ai.categorization.howItWorks.points.override') }}</li>
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
