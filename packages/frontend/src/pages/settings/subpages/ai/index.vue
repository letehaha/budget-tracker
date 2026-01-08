<template>
  <Card class="max-w-4xl">
    <CardHeader class="border-b">
      <h2 class="mb-2 text-2xl font-semibold">{{ $t('settings.ai.title') }}</h2>
      <p class="text-sm opacity-80">{{ $t('settings.ai.description') }}</p>
    </CardHeader>

    <CardContent class="mt-6 flex flex-col gap-6">
      <!-- Loading state -->
      <div v-if="isLoading" class="flex items-center justify-center py-8">
        <Loader2Icon class="text-muted-foreground size-6 animate-spin" />
      </div>

      <template v-else>
        <!-- Tabs for Models and API Keys -->
        <Tabs default-value="ai-features" class="w-full">
          <TabsList class="grid w-full grid-cols-2">
            <TabsTrigger value="ai-features" class="flex items-center gap-2">
              <SparklesIcon class="size-4" />
              {{ $t('settings.ai.tabs.features') }}
            </TabsTrigger>
            <TabsTrigger value="api-keys" class="relative flex items-center gap-2">
              <KeyIcon class="size-4" />
              {{ $t('settings.ai.tabs.apiKeys') }}
              <!-- Red indicator dot when there are invalid keys -->
              <span
                v-if="hasInvalidKeys"
                class="bg-destructive absolute -top-1 -right-1 h-2.5 w-2.5 animate-pulse rounded-full"
                :title="$t('settings.ai.tabs.invalidKeysTooltip')"
              />
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ai-features" class="mt-6">
            <FeatureModelSelector />
          </TabsContent>

          <TabsContent value="api-keys" class="mt-6">
            <ApiKeyManager />

            <!-- How it works for API keys -->
            <div class="mt-6 border-t pt-6">
              <h3 class="mb-2 text-lg font-medium">{{ $t('settings.ai.howApiKeysWork.title') }}</h3>
              <ul class="list-disc space-y-2 pl-5 text-sm leading-relaxed opacity-80">
                <li>{{ $t('settings.ai.howApiKeysWork.points.defaultKey') }}</li>
                <li>{{ $t('settings.ai.howApiKeysWork.points.ownKey') }}</li>
                <li>{{ $t('settings.ai.howApiKeysWork.points.encrypted') }}</li>
                <li>{{ $t('settings.ai.howApiKeysWork.points.removal') }}</li>
              </ul>
            </div>
          </TabsContent>
        </Tabs>
      </template>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/lib/ui/tabs';
import { useAiSettings } from '@/composable/data-queries/ai-settings';
import { KeyIcon, Loader2Icon, SparklesIcon } from 'lucide-vue-next';
import { computed } from 'vue';

import ApiKeyManager from './components/api-key-manager.vue';
import FeatureModelSelector from './components/feature-model-selector.vue';

defineOptions({
  name: 'settings-ai',
});

const { isLoading, configuredProviders } = useAiSettings();

/** True if any API key has invalid status */
const hasInvalidKeys = computed(() => configuredProviders.value.some((p) => p.status === 'invalid'));
</script>
