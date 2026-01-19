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
        <!-- Navigation tabs using router-links -->
        <div class="border-b">
          <nav class="-mb-px flex gap-4">
            <router-link
              :to="{ name: ROUTES_NAMES.settingsAiFeatures }"
              class="flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors"
              :class="[
                isActiveRoute(ROUTES_NAMES.settingsAiFeatures)
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground',
              ]"
            >
              <SparklesIcon class="size-4" />
              {{ $t('settings.ai.tabs.features') }}
            </router-link>

            <router-link
              :to="{ name: ROUTES_NAMES.settingsAiKeys }"
              class="relative flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors"
              :class="[
                isActiveRoute(ROUTES_NAMES.settingsAiKeys)
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground',
              ]"
            >
              <KeyIcon class="size-4" />
              {{ $t('settings.ai.tabs.apiKeys') }}
              <!-- Red indicator dot when there are invalid keys -->
              <span
                v-if="hasInvalidKeys"
                class="bg-destructive absolute -top-1 -right-1 h-2.5 w-2.5 animate-pulse rounded-full"
                :title="$t('settings.ai.tabs.invalidKeysTooltip')"
              />
            </router-link>
          </nav>
        </div>

        <!-- Router view for child routes -->
        <router-view />
      </template>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { useAiSettings } from '@/composable/data-queries/ai-settings';
import { trackAnalyticsEvent } from '@/lib/posthog';
import { ROUTES_NAMES } from '@/routes';
import { KeyIcon, Loader2Icon, SparklesIcon } from 'lucide-vue-next';
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';

defineOptions({
  name: 'settings-ai',
});

onMounted(() => {
  trackAnalyticsEvent({ event: 'ai_settings_visited' });
});

const route = useRoute();
const { isLoading, configuredProviders } = useAiSettings();

/** True if any API key has invalid status */
const hasInvalidKeys = computed(() => configuredProviders.value.some((p) => p.status === 'invalid'));

const isActiveRoute = (routeName: string) => route.name === routeName;
</script>
