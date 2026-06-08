<template>
  <Card class="max-w-5xl">
    <CardHeader class="border-b">
      <h2 class="mb-2 text-2xl font-semibold">{{ $t('payees.title') }}</h2>
      <p class="text-sm opacity-80">{{ $t('payees.subtitle') }}</p>
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
import { SlidersHorizontalIcon, StoreIcon } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

defineOptions({ name: 'settings-payees' });

const { t } = useI18n();

const tabs = computed<RouterTabItem[]>(() => [
  {
    value: ROUTES_NAMES.settingsPayeesManage,
    label: t('payees.tabs.manage'),
    icon: StoreIcon,
  },
  {
    value: ROUTES_NAMES.settingsPayeesSettings,
    label: t('payees.tabs.settings'),
    icon: SlidersHorizontalIcon,
  },
]);
</script>
