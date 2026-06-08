<script setup lang="ts">
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import { Button } from '@/components/lib/ui/button';
import { Checkbox } from '@/components/lib/ui/checkbox';
import { Label } from '@/components/lib/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/lib/ui/radio-group';
import { useNotificationCenter } from '@/components/notification-center';
import { DataExportDownloadFailedError, useDataExport } from '@/composable/data-queries/data-export';
import { ApiErrorResponseError } from '@/js/errors';
import { captureException } from '@/lib/sentry';
import {
  ALL_EXPORT_GROUPS,
  API_ERROR_CODES,
  EXPORT_FORMATS,
  type ExportFormat,
  type ExportGroup,
} from '@bt/shared/types';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ 'update:open': [value: boolean] }>();

const { t } = useI18n();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();

const format = ref<ExportFormat>('json');
const selectedGroups = ref<Set<ExportGroup>>(new Set(ALL_EXPORT_GROUPS));

const allSelected = computed(() => ALL_EXPORT_GROUPS.every((g) => selectedGroups.value.has(g)));
const noneSelected = computed(() => selectedGroups.value.size === 0);

const toggleGroup = ({ group, checked }: { group: ExportGroup; checked: boolean }) => {
  const next = new Set(selectedGroups.value);
  if (checked) next.add(group);
  else next.delete(group);
  selectedGroups.value = next;
};

const toggleAll = ({ checked }: { checked: boolean }) => {
  selectedGroups.value = checked ? new Set(ALL_EXPORT_GROUPS) : new Set();
};

const { mutate, isPending } = useDataExport();

const resolveErrorMessage = (e: unknown): string => {
  if (e instanceof ApiErrorResponseError) {
    // Server message wins when present – for payloadTooLarge it carries the
    // actual row count and limit (e.g. "Export would contain 1,234 rows
    // which exceeds the limit of 1,000"), which the generic i18n string
    // cannot. The localized fallback only fires when the server omits text.
    if (e.data?.message) return e.data.message;
    if (e.data?.code === API_ERROR_CODES.payloadTooLarge) {
      return t('settings.dataManagement.export.notifications.tooLarge');
    }
  }
  if (e instanceof DataExportDownloadFailedError) {
    return t('settings.dataManagement.export.notifications.downloadBlocked');
  }
  return t('settings.dataManagement.export.notifications.failed');
};

const handleConfirm = () => {
  if (noneSelected.value || isPending.value) return;
  mutate(
    { format: format.value, groups: [...selectedGroups.value] },
    {
      onSuccess: ({ totalRows }) => {
        addSuccessNotification(
          totalRows != null
            ? t('settings.dataManagement.export.notifications.successWithCount', { count: totalRows })
            : t('settings.dataManagement.export.notifications.success'),
        );
        emit('update:open', false);
      },
      onError: (e) => {
        addErrorNotification(resolveErrorMessage(e));
        // Only Sentry-report unexpected failures; expected user-facing
        // errors (validation, size limit, browser-blocked download) already
        // surface through a toast and don't need an exception report.
        const isExpected =
          e instanceof DataExportDownloadFailedError ||
          (e instanceof ApiErrorResponseError &&
            (e.data?.code === API_ERROR_CODES.payloadTooLarge || e.data?.code === API_ERROR_CODES.validationError));
        if (!isExpected) {
          captureException({ error: e, context: { feature: 'data-export', format: format.value } });
        }
      },
    },
  );
};

// Each time the dialog opens, reset to the default selection so the user
// starts from a known state instead of inheriting last-time's picks.
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      format.value = 'json';
      selectedGroups.value = new Set(ALL_EXPORT_GROUPS);
    }
  },
);
</script>

<template>
  <ResponsiveDialog
    :open="props.open"
    dialog-content-class="@container/export-dialog"
    drawer-content-class="@container/export-dialog"
    @update:open="(value: boolean) => emit('update:open', value)"
  >
    <template #title>{{ $t('settings.dataManagement.export.dialog.title') }}</template>
    <template #description>
      {{ $t('settings.dataManagement.export.dialog.description') }}
    </template>

    <div class="flex flex-col gap-5 text-left" :aria-busy="isPending">
      <div>
        <Label class="mb-2 block text-sm font-medium">
          {{ $t('settings.dataManagement.export.format.label') }}
        </Label>
        <RadioGroup v-model="format" :disabled="isPending" class="flex flex-wrap gap-3">
          <div v-for="value in EXPORT_FORMATS" :key="value" class="flex items-center gap-2">
            <RadioGroupItem :id="`export-format-${value}`" :value="value" :disabled="isPending" />
            <Label :for="`export-format-${value}`" class="cursor-pointer text-sm">
              {{ $t(`settings.dataManagement.export.format.${value}`) }}
            </Label>
          </div>
        </RadioGroup>
      </div>

      <div>
        <div class="mb-2 flex items-center justify-between">
          <Label class="text-sm font-medium">
            {{ $t('settings.dataManagement.export.groups.label') }}
          </Label>
          <Button
            variant="link"
            size="sm"
            class="h-auto p-0 text-xs"
            :disabled="isPending"
            @click="toggleAll({ checked: !allSelected })"
          >
            {{
              allSelected
                ? $t('settings.dataManagement.export.groups.deselectAll')
                : $t('settings.dataManagement.export.groups.selectAll')
            }}
          </Button>
        </div>
        <div class="grid grid-cols-1 gap-2 @sm/export-dialog:grid-cols-2">
          <Label
            v-for="group in ALL_EXPORT_GROUPS"
            :key="group"
            :for="`export-group-${group}`"
            class="border-border hover:bg-muted/50 flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm"
          >
            <Checkbox
              :id="`export-group-${group}`"
              :model-value="selectedGroups.has(group)"
              :disabled="isPending"
              @update:model-value="(checked) => toggleGroup({ group, checked: checked === true })"
            />
            <div class="flex flex-col">
              <span class="font-medium">{{ $t(`settings.dataManagement.export.groups.${group}`) }}</span>
              <span class="text-muted-foreground text-xs">
                {{ $t(`settings.dataManagement.export.groups.${group}Description`) }}
              </span>
            </div>
          </Label>
        </div>
      </div>
    </div>

    <template #footer="{ close }">
      <Button variant="outline" :disabled="isPending" @click="close">
        {{ $t('common.actions.cancel') }}
      </Button>
      <Button :disabled="noneSelected || isPending" @click="handleConfirm">
        {{
          isPending
            ? $t('settings.dataManagement.export.dialog.confirmLoading')
            : $t('settings.dataManagement.export.dialog.confirmLabel')
        }}
      </Button>
    </template>
  </ResponsiveDialog>
</template>
