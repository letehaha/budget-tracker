<template>
  <div class="flex flex-col gap-8">
    <div class="flex flex-col gap-6">
      <div>
        <h3 class="text-lg font-semibold">{{ $t('payees.settings.title') }}</h3>
        <p class="text-muted-foreground mt-1 text-sm">{{ $t('payees.settings.description') }}</p>
      </div>

      <div class="flex items-center justify-between gap-4">
        <div class="flex-1">
          <div class="text-sm font-medium">
            {{ $t('payees.settings.payeeFromDescription.label') }}
          </div>
          <p class="text-muted-foreground mt-1 text-xs leading-relaxed">
            {{ $t('payees.settings.payeeFromDescription.description') }}
          </p>
        </div>
        <Switch
          :model-value="payeeExtractionUsesDescription"
          :disabled="isUpdating"
          @update:model-value="handleToggle"
        />
      </div>

      <div class="@container/bulk-row flex flex-col gap-3">
        <div>
          <div class="text-sm font-medium">{{ $t('payees.settings.bulkCategorizationMode.label') }}</div>
          <p class="text-muted-foreground mt-1 text-xs leading-relaxed">
            {{ $t('payees.settings.bulkCategorizationMode.description') }}
          </p>
        </div>

        <div class="flex flex-col gap-1">
          <div class="flex flex-col gap-2 @[440px]/bulk-row:flex-row @[440px]/bulk-row:items-end">
            <SelectField
              v-model="bulkMode"
              :values="bulkModeOptions"
              label-key="label"
              value-key="value"
              :label="$t('payees.form.categorizationMode.label')"
              class="min-w-0 flex-1"
            />
            <Button class="shrink-0" :disabled="bulkMut.isPending.value" @click="openBulkConfirm">
              {{ $t('payees.settings.bulkCategorizationMode.applyButton') }}
            </Button>
          </div>
          <p class="text-muted-foreground text-xs">{{ bulkMode.hint }}</p>
        </div>
      </div>

      <ResponsiveAlertDialog
        v-model:open="bulkConfirmOpen"
        :confirm-label="$t('common.actions.apply')"
        confirm-variant="destructive"
        @confirm="handleBulkApply"
      >
        <template #title>{{ $t('payees.settings.bulkCategorizationMode.confirmTitle') }}</template>
        <template #description>
          {{ $t('payees.settings.bulkCategorizationMode.confirmDescription', { mode: bulkMode.label }) }}
        </template>
      </ResponsiveAlertDialog>
    </div>

    <div class="border-border border-t" />

    <IgnoredNamesSection />
  </div>
</template>

<script setup lang="ts">
import { useBulkUpdateCategorizationMode } from '@/composable/data-queries/payees';
import { useNotificationCenter } from '@/components/notification-center';
import { useUserSettings } from '@/composable/data-queries/user-settings';
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import SelectField from '@/components/fields/select-field.vue';
import { Button } from '@/components/lib/ui/button';
import { Switch } from '@/components/lib/ui/switch';
import { CATEGORIZATION_MODE } from '@bt/shared/types';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import IgnoredNamesSection from './ignored-names-section.vue';

const { t } = useI18n();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const { data: userSettings, mutateAsync, isUpdating } = useUserSettings();

const payeeExtractionUsesDescription = computed(() => userSettings.value?.payeeExtractionUsesDescription ?? false);

const handleToggle = async (value: boolean) => {
  try {
    await mutateAsync({
      ...userSettings.value,
      payeeExtractionUsesDescription: value,
    });
    addSuccessNotification(t('payees.settings.payeeFromDescription.successNotification'));
  } catch {
    addErrorNotification(t('payees.settings.payeeFromDescription.errorNotification'));
  }
};

interface BulkModeOption {
  value: CATEGORIZATION_MODE;
  label: string;
  hint: string;
}

const bulkModeOptions = computed<BulkModeOption[]>(() => [
  {
    value: CATEGORIZATION_MODE.enforce,
    label: t('payees.form.categorizationMode.enforce.label'),
    hint: t('payees.form.categorizationMode.enforce.hint'),
  },
  {
    value: CATEGORIZATION_MODE.hint,
    label: t('payees.form.categorizationMode.hint.label'),
    hint: t('payees.form.categorizationMode.hint.hint'),
  },
  {
    value: CATEGORIZATION_MODE.off,
    label: t('payees.form.categorizationMode.off.label'),
    hint: t('payees.form.categorizationMode.off.hint'),
  },
]);

const bulkMode = ref<BulkModeOption>(bulkModeOptions.value[0]!);
const bulkConfirmOpen = ref(false);
const openBulkConfirm = () => (bulkConfirmOpen.value = true);

const bulkMut = useBulkUpdateCategorizationMode();
async function handleBulkApply() {
  try {
    const result = await bulkMut.mutateAsync({ mode: bulkMode.value.value });
    addSuccessNotification(
      t('payees.settings.bulkCategorizationMode.successNotification', { count: result.updatedCount }),
    );
  } catch {
    addErrorNotification(t('payees.settings.bulkCategorizationMode.errorNotification'));
  }
}
</script>
