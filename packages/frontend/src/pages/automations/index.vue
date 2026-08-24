<script setup lang="ts">
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import SelectField from '@/components/fields/select-field.vue';
import { Button } from '@/components/lib/ui/button';
import { Card } from '@/components/lib/ui/card';
import { PillTabs, type PillTabItem } from '@/components/lib/ui/pill-tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/lib/ui/popover';
import { useNotificationCenter } from '@/components/notification-center';
import { useDeleteAutomation, useTransactionAutomations } from '@/composable/data-queries/transaction-automations';
import { trackAnalyticsEvent } from '@/lib/posthog';
import { captureException } from '@/lib/sentry';
import { ROUTES_NAMES } from '@/routes';
import { useTagsStore } from '@/stores';
import type { TransactionAutomationModel } from '@bt/shared/types';
import { LightbulbIcon, PlusIcon, ZapIcon } from '@lucide/vue';
import { useLocalStorage } from '@vueuse/core';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import type { AutomationDensity } from './components/automation-chips';
import AutomationsList from './components/automations-list.vue';

const SKELETON_ROW_COUNT = 3;

const { t } = useI18n();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();

useTagsStore()
  .loadTags()
  .catch((error) => captureException({ error, context: { scope: 'automations-list:load-tags' } }));

const { list, isLoading, isError } = useTransactionAutomations();
const deleteMutation = useDeleteAutomation();

const density = useLocalStorage<AutomationDensity>('automations:density', 'compact');
const densityItems = computed<PillTabItem[]>(() => [
  { value: 'compact', label: t('automations.density.compact') },
  { value: 'comfortable', label: t('automations.density.comfortable') },
]);

type StatusFilter = 'all' | 'enabled' | 'disabled';
const STATUS_FILTERS: StatusFilter[] = ['all', 'enabled', 'disabled'];
const statusFilter = ref<StatusFilter>('all');
const statusFilterOptions = computed(() =>
  STATUS_FILTERS.map((value) => ({ value, label: t(`automations.statusFilter.${value}`) })),
);
const selectedStatusFilter = computed(
  () => statusFilterOptions.value.find((option) => option.value === statusFilter.value) ?? null,
);
const filteredList = computed(() =>
  statusFilter.value === 'all'
    ? list.value
    : list.value.filter((rule) => rule.isEnabled === (statusFilter.value === 'enabled')),
);

const onTipsOpen = (open: boolean) => {
  if (open) trackAnalyticsEvent({ event: 'automations_mcp_tip_opened' });
};

const isDeleteOpen = ref(false);
const ruleToDelete = ref<TransactionAutomationModel | null>(null);

const confirmDelete = ({ rule }: { rule: TransactionAutomationModel }) => {
  ruleToDelete.value = rule;
  isDeleteOpen.value = true;
};

const handleDelete = () => {
  const rule = ruleToDelete.value;
  if (!rule) return;

  isDeleteOpen.value = false;
  deleteMutation.mutate(
    { id: rule.id },
    {
      onSuccess: () => addSuccessNotification(t('automations.notifications.deleteSuccess')),
      onError: () => addErrorNotification(t('automations.notifications.deleteError')),
    },
  );
};
</script>

<template>
  <div class="@container/automations flex max-w-5xl flex-col gap-6 p-4 md:p-6">
    <div class="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1">
      <div class="flex items-center gap-2">
        <h1 class="text-2xl font-bold tracking-tight">
          {{ $t('automations.title') }}
        </h1>
        <Popover @update:open="onTipsOpen">
          <PopoverTrigger as-child>
            <Button variant="soft-primary" size="sm">
              <LightbulbIcon class="size-4" />
              {{ $t('automations.mcpTip.trigger') }}
            </Button>
          </PopoverTrigger>
          <PopoverContent class="w-80 text-sm" align="start">
            <p>{{ $t('automations.mcpTip.text') }}</p>
            <RouterLink
              class="text-primary-text mt-2 inline-block underline underline-offset-2"
              :to="{ name: ROUTES_NAMES.settingsAiIntegrations }"
            >
              {{ $t('automations.mcpTip.link') }}
            </RouterLink>
          </PopoverContent>
        </Popover>
      </div>
      <router-link :to="{ name: ROUTES_NAMES.automationCreate }">
        <Button as="span">
          <PlusIcon class="size-4" />
          <span class="hidden @md/automations:inline">{{ $t('automations.newAutomation') }}</span>
          <span class="@md/automations:hidden">{{ $t('automations.new') }}</span>
        </Button>
      </router-link>
      <p class="text-muted-foreground col-span-2 text-sm">
        {{ $t('automations.subtitle') }}
      </p>
    </div>

    <div v-if="list.length" class="flex items-center justify-between gap-2">
      <PillTabs
        size="sm"
        :items="densityItems"
        :model-value="density"
        @update:model-value="(value) => (density = value as AutomationDensity)"
      />
      <SelectField
        class="w-auto min-w-36"
        :model-value="selectedStatusFilter"
        :values="statusFilterOptions"
        :placeholder="$t('automations.statusFilter.all')"
        @update:model-value="(option) => option && (statusFilter = option.value)"
      />
    </div>

    <Card v-if="isLoading" class="flex flex-col gap-2 p-3">
      <div v-for="index in SKELETON_ROW_COUNT" :key="index" class="bg-muted h-14 animate-pulse rounded-md" />
    </Card>

    <Card v-else-if="isError && !list.length" class="text-destructive-text px-6 py-12 text-center text-sm">
      {{ $t('automations.loadError') }}
    </Card>

    <Card v-else-if="list.length === 0" class="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <ZapIcon class="text-muted-foreground size-8" />
      <h2 class="font-medium">{{ $t('automations.emptyState.title') }}</h2>
      <p class="text-muted-foreground max-w-md text-sm">
        {{ $t('automations.emptyState.description') }}
      </p>
      <router-link class="mt-2" :to="{ name: ROUTES_NAMES.automationCreate }">
        <Button as="span">
          <PlusIcon class="size-4" />
          {{ $t('automations.emptyState.cta') }}
        </Button>
      </router-link>
    </Card>

    <Card v-else-if="filteredList.length === 0" class="text-muted-foreground px-6 py-12 text-center text-sm">
      {{ $t('automations.statusFilter.empty') }}
    </Card>

    <Card v-else class="overflow-hidden">
      <AutomationsList
        :rules="filteredList"
        :density="density"
        :reorderable="statusFilter === 'all'"
        @delete="(rule) => confirmDelete({ rule })"
      />
    </Card>

    <ResponsiveAlertDialog
      v-model:open="isDeleteOpen"
      :confirm-label="$t('automations.delete.confirm')"
      confirm-variant="destructive"
      @confirm="handleDelete"
    >
      <template #title>{{ $t('automations.delete.title') }}</template>
      <template #description>
        {{
          $t('automations.delete.description', {
            name: ruleToDelete?.name ?? '',
          })
        }}
      </template>
    </ResponsiveAlertDialog>
  </div>
</template>
