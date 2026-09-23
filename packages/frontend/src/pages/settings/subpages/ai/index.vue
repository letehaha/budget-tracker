<template>
  <Card class="max-w-4xl">
    <CardHeader class="border-b">
      <h2 class="mb-2 text-2xl font-semibold">{{ $t('settings.ai.title') }}</h2>
      <p class="text-sm opacity-80">{{ $t('settings.ai.description') }}</p>
    </CardHeader>

    <CardContent class="mt-6 flex flex-col gap-6">
      <RouterTabs :items="tabs">
        <template #trailing="{ item }">
          <DesktopOnlyTooltip
            v-if="item.value === ROUTES_NAMES.settingsAiModels && hasInvalidConnections"
            :content="$t('settings.ai.tabs.invalidConnectionsTooltip')"
          >
            <TriangleAlertIcon class="text-destructive-text ml-1 size-4" />
          </DesktopOnlyTooltip>
        </template>
      </RouterTabs>

      <router-view />
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { RouterTabs, type RouterTabItem } from '@/components/lib/ui/router-tabs';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { useAiConnectionsList } from '@/composable/data-queries/use-ai-connections';
import { trackAnalyticsEvent } from '@/lib/posthog';
import { ROUTES_NAMES } from '@/routes';
import { BrainIcon, PlugIcon, SparklesIcon, TriangleAlertIcon } from '@lucide/vue';
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';

defineOptions({
  name: 'settings-ai',
});

onMounted(() => {
  trackAnalyticsEvent({ event: 'ai_settings_visited' });
});

const { t } = useI18n();
const { connections } = useAiConnectionsList();

const hasInvalidConnections = computed(() => connections.value.some((c) => c.status === 'invalid'));

const tabs = computed<RouterTabItem[]>(() => [
  {
    value: ROUTES_NAMES.settingsAiFeatures,
    label: t('settings.ai.tabs.features'),
    icon: SparklesIcon,
  },
  {
    value: ROUTES_NAMES.settingsAiModels,
    label: t('settings.ai.tabs.models'),
    icon: BrainIcon,
  },
  {
    value: ROUTES_NAMES.settingsAiConnectedApps,
    label: t('settings.ai.tabs.connectedApps'),
    icon: PlugIcon,
  },
]);
</script>
