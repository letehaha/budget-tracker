<template>
  <Card class="max-w-4xl">
    <CardHeader class="border-b">
      <h2 class="mb-2 text-2xl font-semibold">AI Settings</h2>
      <p class="text-sm opacity-80">Configure AI-powered features like automatic transaction categorization</p>
    </CardHeader>

    <CardContent class="mt-6 flex flex-col gap-6">
      <!-- Loading state -->
      <div v-if="isLoading" class="flex items-center justify-center py-8">
        <Loader2Icon class="text-muted-foreground h-6 w-6 animate-spin" />
      </div>

      <template v-else>
        <!-- Tabs for Models and API Keys -->
        <Tabs default-value="ai-features" class="w-full">
          <TabsList class="grid w-full grid-cols-2">
            <TabsTrigger value="ai-features" class="flex items-center gap-2">
              <SparklesIcon class="size-4" />
              AI Features
            </TabsTrigger>
            <TabsTrigger value="api-keys" class="relative flex items-center gap-2">
              <KeyIcon class="size-4" />
              API Keys
              <!-- Red indicator dot when there are invalid keys -->
              <span
                v-if="hasInvalidKeys"
                class="bg-destructive absolute -top-1 -right-1 h-2.5 w-2.5 animate-pulse rounded-full"
                title="One or more API keys are invalid"
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
              <h3 class="mb-2 text-lg font-medium">How API keys work</h3>
              <ul class="list-disc space-y-2 pl-5 text-sm leading-relaxed opacity-80">
                <li>By default, AI features use our server's API key at no extra cost to you.</li>
                <li>
                  If you add your own API key for a provider, that key will be used instead for models from that
                  provider.
                </li>
                <li>Your API keys are encrypted with AES-256-GCM and stored securely.</li>
                <li>You can remove your key anytime to switch back to the server-provided key.</li>
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
