<template>
  <Popover>
    <PopoverTrigger as-child>
      <Button size="icon-sm" variant="ghost">
        <SettingsIcon class="text-muted-foreground size-4" />
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-64 text-sm" align="end">
      <form class="grid gap-3" @submit.prevent="save">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1">
            <label class="text-sm font-medium">{{
              t('dashboard.widgets.balanceTrend.spikeSettings.showMarkers')
            }}</label>
            <ResponsiveTooltip
              :delay-duration="100"
              :content="t('dashboard.widgets.balanceTrend.spikeSettings.showMarkersTooltip')"
              content-class-name="max-w-52"
            >
              <InfoIcon class="text-muted-foreground size-3.5 cursor-help" @click.prevent.stop />
            </ResponsiveTooltip>
          </div>
          <Switch v-model:model-value="form.enabled" />
        </div>

        <template v-if="form.enabled">
          <InputField
            v-model="form.percentThreshold"
            type="number"
            :label="t('dashboard.widgets.balanceTrend.spikeSettings.percentThreshold')"
            :error-message="getFieldErrorMessage('form.percentThreshold')"
            @blur="touchField('form.percentThreshold')"
          >
            <template #label-right>
              <ResponsiveTooltip
                :delay-duration="100"
                :content="t('dashboard.widgets.balanceTrend.spikeSettings.percentThresholdTooltip')"
                content-class-name="max-w-52"
              >
                <InfoIcon class="text-muted-foreground size-3.5 cursor-help" @click.prevent.stop />
              </ResponsiveTooltip>
            </template>
          </InputField>
          <InputField
            v-model="form.absoluteThreshold"
            type="number"
            :label="t('dashboard.widgets.balanceTrend.spikeSettings.absoluteThreshold')"
            :error-message="getFieldErrorMessage('form.absoluteThreshold')"
            @blur="touchField('form.absoluteThreshold')"
          >
            <template #label-right>
              <ResponsiveTooltip
                :delay-duration="100"
                :content="t('dashboard.widgets.balanceTrend.spikeSettings.absoluteThresholdTooltip')"
                content-class-name="max-w-52"
              >
                <InfoIcon class="text-muted-foreground size-3.5 cursor-help" @click.prevent.stop />
              </ResponsiveTooltip>
            </template>
          </InputField>
          <InputField
            v-model="form.maxSpikes"
            type="number"
            :label="t('dashboard.widgets.balanceTrend.spikeSettings.maxMarkers')"
            :error-message="getFieldErrorMessage('form.maxSpikes')"
            @blur="touchField('form.maxSpikes')"
          >
            <template #label-right>
              <ResponsiveTooltip
                :delay-duration="100"
                :content="t('dashboard.widgets.balanceTrend.spikeSettings.maxMarkersTooltip')"
                content-class-name="max-w-52"
              >
                <InfoIcon class="text-muted-foreground size-3.5 cursor-help" @click.prevent.stop />
              </ResponsiveTooltip>
            </template>
          </InputField>
        </template>

        <div class="flex gap-2">
          <Button type="button" variant="outline" size="sm" class="flex-1" @click="resetDefaults">
            {{ t('dashboard.widgets.balanceTrend.spikeSettings.resetDefaults') }}
          </Button>
          <Button v-if="isDirty" type="submit" size="sm" class="flex-1">
            {{ t('dashboard.widgets.balanceTrend.spikeSettings.accept') }}
          </Button>
        </div>
      </form>
    </PopoverContent>
  </Popover>
</template>

<script lang="ts" setup>
import type { DashboardWidgetConfig } from '@/api/user-settings';
import ResponsiveTooltip from '@/components/common/responsive-tooltip.vue';
import InputField from '@/components/fields/input-field.vue';
import { Button } from '@/components/lib/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/lib/ui/popover';
import { Switch } from '@/components/lib/ui/switch';
import { SPIKE_DEFAULTS } from '@/composable/charts/use-spike-detection';
import { useUserSettings } from '@/composable/data-queries/user-settings';
import { useFormValidation } from '@/composable/form-validator';
import { between, integer, required } from '@/js/helpers/validators';
import { InfoIcon, SettingsIcon } from 'lucide-vue-next';
import type { Ref } from 'vue';
import { computed, inject, reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n({ useScope: 'global' });
const widgetConfigRef = inject<Ref<DashboardWidgetConfig> | null>('dashboard-widget-config', null);
const { data: userSettingsData, mutateAsync: saveUserSettings } = useUserSettings();

const SPIKE_CONFIG_KEY_MAP: Record<string, string> = {
  enabled: 'spikesEnabled',
  percentThreshold: 'spikePercentThreshold',
  absoluteThreshold: 'spikeAbsoluteThreshold',
  maxSpikes: 'spikeMaxCount',
};

// Read persisted config from the injected widget config
const persistedSettings = computed(() => {
  const cfg = widgetConfigRef?.value?.config;
  return {
    enabled: (cfg?.spikesEnabled as boolean | undefined) ?? SPIKE_DEFAULTS.enabled,
    percentThreshold: (cfg?.spikePercentThreshold as number | undefined) ?? SPIKE_DEFAULTS.percentThreshold,
    absoluteThreshold: (cfg?.spikeAbsoluteThreshold as number | undefined) ?? SPIKE_DEFAULTS.absoluteThreshold,
    maxSpikes: (cfg?.spikeMaxCount as number | undefined) ?? SPIKE_DEFAULTS.maxSpikes,
  };
});

const form = reactive({
  enabled: persistedSettings.value.enabled,
  percentThreshold: persistedSettings.value.percentThreshold as number | string,
  absoluteThreshold: persistedSettings.value.absoluteThreshold as number | string,
  maxSpikes: persistedSettings.value.maxSpikes as number | string,
});

// Sync form when persisted settings change (e.g. after save propagates)
watch(persistedSettings, (next) => {
  form.enabled = next.enabled;
  form.percentThreshold = next.percentThreshold;
  form.absoluteThreshold = next.absoluteThreshold;
  form.maxSpikes = next.maxSpikes;
});

const { isFormValid, getFieldErrorMessage, touchField, resetValidation } = useFormValidation(
  { form },
  {
    form: {
      percentThreshold: { required, between: between(1, 50) },
      absoluteThreshold: { required, between: between(1, 10000) },
      maxSpikes: { required, integer, between: between(1, 20) },
    },
  },
  undefined,
  {
    customValidationMessages: {
      between: t('dashboard.widgets.balanceTrend.spikeSettings.validation.outOfRange'),
      integer: t('dashboard.widgets.balanceTrend.spikeSettings.validation.integer'),
    },
  },
);

const isDirty = computed(() => {
  const p = persistedSettings.value;
  return (
    form.enabled !== p.enabled ||
    Number(form.percentThreshold) !== p.percentThreshold ||
    Number(form.absoluteThreshold) !== p.absoluteThreshold ||
    Number(form.maxSpikes) !== p.maxSpikes
  );
});

function resetDefaults() {
  form.enabled = SPIKE_DEFAULTS.enabled;
  form.percentThreshold = SPIKE_DEFAULTS.percentThreshold;
  form.absoluteThreshold = SPIKE_DEFAULTS.absoluteThreshold;
  form.maxSpikes = SPIKE_DEFAULTS.maxSpikes;
  resetValidation();
}

async function save() {
  if (!isFormValid()) return;
  if (!isDirty.value) return;

  const settings = userSettingsData.value;
  if (!settings || !widgetConfigRef?.value) return;

  const patch: Record<string, unknown> = {};
  const formSnapshot = {
    enabled: form.enabled,
    percentThreshold: Number(form.percentThreshold),
    absoluteThreshold: Number(form.absoluteThreshold),
    maxSpikes: Number(form.maxSpikes),
  };

  for (const [field, configKey] of Object.entries(SPIKE_CONFIG_KEY_MAP)) {
    patch[configKey] = formSnapshot[field as keyof typeof formSnapshot];
  }

  const widgets = [...(settings.dashboard?.widgets ?? [])];
  const idx = widgets.findIndex((w) => w.widgetId === widgetConfigRef.value!.widgetId);
  if (idx === -1) return;

  widgets[idx] = {
    ...widgets[idx]!,
    config: { ...widgets[idx]!.config, ...patch },
  };

  await saveUserSettings({ ...settings, dashboard: { widgets } });
  resetValidation();
}
</script>
