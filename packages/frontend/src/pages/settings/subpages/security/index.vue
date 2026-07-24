<template>
  <Card class="max-w-4xl">
    <CardHeader class="border-b">
      <h2 class="mb-2 text-2xl font-semibold">{{ $t('settings.security.title') }}</h2>
      <p class="text-sm opacity-80">{{ $t('settings.security.description') }}</p>
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
import { DatabaseBackupIcon, KeyRoundIcon, LockIcon, MonitorSmartphoneIcon, TriangleAlertIcon } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

defineOptions({
  name: 'settings-security',
});

const { t } = useI18n();

const tabs = computed<RouterTabItem[]>(() => [
  {
    value: ROUTES_NAMES.settingsSecurityLoginMethods,
    label: t('settings.security.tabs.loginMethods'),
    icon: KeyRoundIcon,
  },
  {
    value: ROUTES_NAMES.settingsSecuritySessions,
    label: t('settings.security.tabs.activeSessions'),
    icon: MonitorSmartphoneIcon,
  },
  {
    value: ROUTES_NAMES.settingsSecurityPassword,
    label: t('settings.security.tabs.password'),
    icon: LockIcon,
  },
  {
    value: ROUTES_NAMES.settingsSecurityBackup,
    label: t('settings.security.tabs.backup'),
    icon: DatabaseBackupIcon,
  },
  {
    value: ROUTES_NAMES.settingsSecurityDanger,
    label: t('settings.security.tabs.dangerZone'),
    icon: TriangleAlertIcon,
    iconClass: 'text-destructive-text',
  },
]);
</script>
