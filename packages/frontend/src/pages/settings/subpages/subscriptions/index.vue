<template>
  <Card class="max-w-4xl">
    <CardHeader class="border-b">
      <h2 class="mb-2 text-2xl font-semibold">{{ $t('settings.subscriptions.title') }}</h2>
    </CardHeader>

    <CardContent class="mt-6">
      <div class="flex items-center justify-between gap-4">
        <div class="flex-1">
          <div class="text-sm font-medium">
            {{ $t('settings.subscriptions.defaultAutoRecord.label') }}
          </div>
          <p class="text-muted-foreground mt-1 text-xs leading-relaxed">
            {{ $t('settings.subscriptions.defaultAutoRecord.help') }}
          </p>
        </div>
        <Switch :model-value="defaultAutoRecord" :disabled="isPatching" @update:model-value="handleToggle" />
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { Switch } from '@/components/lib/ui/switch';
import { useNotificationCenter } from '@/components/notification-center';
import { useUserSettings } from '@/composable/data-queries/user-settings';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const { data: userSettings, patchAsync, isPatching } = useUserSettings();

const defaultAutoRecord = computed(() => userSettings.value?.subscriptions?.defaultAutoRecord ?? false);

const handleToggle = async (value: boolean) => {
  try {
    await patchAsync({ subscriptions: { defaultAutoRecord: value } });
    addSuccessNotification(t('settings.subscriptions.defaultAutoRecord.successNotification'));
  } catch {
    addErrorNotification(t('settings.subscriptions.defaultAutoRecord.errorNotification'));
  }
};
</script>
