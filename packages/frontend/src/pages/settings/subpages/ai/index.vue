<template>
  <Card class="max-w-4xl">
    <CardHeader class="border-b">
      <h2 class="mb-2 text-2xl font-semibold">{{ $t('settings.ai.title') }}</h2>
      <p class="text-sm opacity-80">{{ $t('settings.ai.description') }}</p>
    </CardHeader>

    <CardContent class="mt-6 flex flex-col gap-6">
      <div v-if="isLoading" class="flex items-center justify-center py-8">
        <Loader2Icon class="text-muted-foreground size-6 animate-spin" />
      </div>

      <template v-else>
        <RouterTabs :items="tabs">
          <template #trailing="{ item }">
            <DesktopOnlyTooltip
              v-if="item.value === ROUTES_NAMES.settingsAiKeys && hasInvalidKeys"
              :content="$t('settings.ai.tabs.invalidKeysTooltip')"
            >
              <span class="bg-destructive ml-1 inline-block size-2.5 animate-pulse rounded-full" />
            </DesktopOnlyTooltip>
          </template>
        </RouterTabs>

        <router-view />
      </template>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { RouterTabs, type RouterTabItem } from '@/components/lib/ui/router-tabs';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { useAiSettings } from '@/composable/data-queries/ai-settings';
import { trackAnalyticsEvent } from '@/lib/posthog';
import { ROUTES_NAMES } from '@/routes';
import { KeyIcon, Loader2Icon, SparklesIcon } from '@lucide/vue';
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';

defineOptions({
  name: 'settings-ai',
});

onMounted(() => {
  trackAnalyticsEvent({ event: 'ai_settings_visited' });
});

const { t } = useI18n();
const { isLoading, configuredProviders } = useAiSettings();

const hasInvalidKeys = computed(() => configuredProviders.value.some((p) => p.status === 'invalid'));

const tabs = computed<RouterTabItem[]>(() => [
  {
    value: ROUTES_NAMES.settingsAiFeatures,
    label: t('settings.ai.tabs.features'),
    icon: SparklesIcon,
  },
  {
    value: ROUTES_NAMES.settingsAiKeys,
    label: t('settings.ai.tabs.apiKeys'),
    icon: KeyIcon,
  },
]);
</script>
