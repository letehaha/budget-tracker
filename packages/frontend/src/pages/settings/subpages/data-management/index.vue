<template>
  <Card class="@container/data-mgmt max-w-4xl">
    <CardHeader class="border-b">
      <h2 class="mb-2 text-2xl font-semibold text-balance">
        {{ $t('settings.dataManagement.title') }}
      </h2>
      <p class="text-sm opacity-80">{{ $t('settings.dataManagement.description') }}</p>
    </CardHeader>

    <CardContent class="mt-6 flex flex-col gap-6">
      <RouterTabs :items="tabs" />
      <router-view />
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { RouterTabs, type RouterTabItem } from '@/components/lib/ui/router-tabs';
import { ROUTES_NAMES } from '@/routes';
import { DownloadIcon, UploadIcon } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

defineOptions({
  name: 'settings-data-management',
});

const { t } = useI18n();

const tabs = computed<RouterTabItem[]>(() => [
  {
    value: ROUTES_NAMES.settingsDataManagementImport,
    label: t('settings.dataManagement.tabs.import'),
    icon: UploadIcon,
  },
  {
    value: ROUTES_NAMES.settingsDataManagementExport,
    label: t('settings.dataManagement.tabs.export'),
    icon: DownloadIcon,
  },
]);
</script>
