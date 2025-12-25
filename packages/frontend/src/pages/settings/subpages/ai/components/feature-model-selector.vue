<template>
  <div class="space-y-4">
    <div>
      <h3 class="text-lg font-medium">AI Features</h3>
      <p class="text-muted-foreground text-sm">
        Configure which model to use for each AI-powered feature
      </p>
    </div>

    <div v-if="isLoading" class="text-muted-foreground flex items-center gap-2 py-4 text-sm">
      <Loader2Icon class="h-4 w-4 animate-spin" />
      Loading features...
    </div>

    <div v-else class="space-y-4">
      <!-- Render feature-specific components -->
      <template v-for="feature in featuresStatus" :key="feature.feature">
        <CategorizationFeature
          v-if="feature.feature === AI_FEATURE.categorization"
          :feature-status="feature"
        />
        <!-- Add more feature components here as they are implemented -->
        <!-- Example:
        <SomeOtherFeature
          v-else-if="feature.feature === AI_FEATURE.someOther"
          :feature-status="feature"
        />
        -->
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAiSettings } from '@/composable/data-queries/ai-settings';
import { AI_FEATURE } from '@bt/shared/types';
import { Loader2Icon } from 'lucide-vue-next';

import CategorizationFeature from './features/categorization-feature.vue';

const { featuresStatus, isLoadingFeatures: isLoading } = useAiSettings();
</script>
