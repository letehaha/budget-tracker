<template>
  <div class="space-y-4">
    <div>
      <h3 class="text-lg font-medium">{{ $t('settings.ai.features.title') }}</h3>
      <p class="text-muted-foreground text-sm">{{ $t('settings.ai.features.description') }}</p>
    </div>

    <div v-if="isLoading" class="text-muted-foreground flex items-center gap-2 py-4 text-sm">
      <Loader2Icon class="size-4 animate-spin" />
      {{ $t('settings.ai.features.loading') }}
    </div>

    <div v-else class="space-y-3">
      <!-- Render feature-specific components -->
      <template v-for="feature in featuresStatus" :key="feature.feature">
        <CategorizationFeature v-if="feature.feature === AI_FEATURE.categorization" :feature-status="feature" />
        <StatementParsingFeature
          v-else-if="feature.feature === AI_FEATURE.statementParsing"
          :feature-status="feature"
        />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAiSettings } from '@/composable/data-queries/ai-settings';
import { AI_FEATURE } from '@bt/shared/types';
import { Loader2Icon } from 'lucide-vue-next';

import CategorizationFeature from './features/categorization-feature.vue';
import StatementParsingFeature from './features/statement-parsing-feature.vue';

const { featuresStatus, isLoadingFeatures: isLoading } = useAiSettings();
</script>
