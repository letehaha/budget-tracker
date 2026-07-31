<template>
  <div class="rounded-lg border p-3" :class="{ 'border-destructive/50 bg-destructive/5': isEndpointInvalid }">
    <div class="flex items-start gap-3">
      <Loader2Icon v-if="isTestingCustomEndpoint" class="text-muted-foreground mt-0.5 size-5 shrink-0 animate-spin" />
      <DesktopOnlyTooltip v-else :content="statusText">
        <AlertCircleIcon v-if="isEndpointInvalid" class="text-destructive-text mt-0.5 size-5 shrink-0" />
        <CheckCircleIcon v-else class="text-success-text mt-0.5 size-5 shrink-0" />
      </DesktopOnlyTooltip>

      <!-- Narrow: name / base URL / model stacked. Wide: name and model share a line,
      `w-full` pushes the base URL onto its own. -->
      <div
        class="flex min-w-0 flex-1 flex-col gap-0.5 @md/ai-endpoints:flex-row @md/ai-endpoints:flex-wrap @md/ai-endpoints:items-baseline @md/ai-endpoints:gap-x-3"
      >
        <div class="flex min-w-0 items-center gap-2 @md/ai-endpoints:flex-1">
          <DesktopOnlyTooltip :content="endpoint.name" only-when-truncated>
            <span class="truncate text-sm font-medium">{{ endpoint.name }}</span>
          </DesktopOnlyTooltip>
          <span
            v-if="isEndpointInvalid"
            class="bg-destructive/10 text-destructive-text shrink-0 rounded-full px-2 py-0.5 text-xs"
          >
            {{ $t('settings.ai.customEndpoint.badges.invalid') }}
          </span>
        </div>

        <DesktopOnlyTooltip :content="endpoint.baseUrl" only-when-truncated>
          <span class="text-muted-foreground truncate text-xs @md/ai-endpoints:order-3 @md/ai-endpoints:w-full">
            {{ endpoint.baseUrl }}
          </span>
        </DesktopOnlyTooltip>

        <DesktopOnlyTooltip :content="modelLabel" only-when-truncated>
          <span
            class="text-muted-foreground min-w-0 truncate text-xs @md/ai-endpoints:order-2 @md/ai-endpoints:max-w-[40%]"
          >
            {{ modelLabel }}
          </span>
        </DesktopOnlyTooltip>
      </div>

      <ResponsiveMenu v-model:open="isMenuOpen">
        <template #trigger>
          <Button
            variant="ghost"
            size="icon-sm"
            class="shrink-0"
            :aria-label="$t('settings.ai.customEndpoint.actions.menuAriaLabel')"
          >
            <MoreVerticalIcon class="size-4" />
          </Button>
        </template>

        <template #default="{ close }">
          <Button variant="ghost" size="sm" class="w-full justify-start gap-2" @click="handleEdit({ close })">
            <PencilIcon class="size-4" />
            {{ $t('common.actions.edit') }}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            class="w-full justify-start gap-2"
            :disabled="isBusy"
            @click="handleTest({ close })"
          >
            <PlugZapIcon class="size-4" />
            {{ $t('settings.ai.customEndpoint.form.testButton') }}
          </Button>

          <div class="bg-border my-1 h-px" />

          <Button
            variant="ghost"
            size="sm"
            class="text-destructive-text hover:text-destructive-text w-full justify-start gap-2"
            :disabled="isBusy"
            @click="handleRemove({ close })"
          >
            <Trash2Icon class="size-4" />
            {{ $t('settings.ai.customEndpoint.form.removeButton') }}
          </Button>
        </template>
      </ResponsiveMenu>
    </div>

    <p v-if="isEndpointInvalid && endpoint.lastError" class="text-destructive-text mt-2 text-xs break-words">
      {{ endpoint.lastError }}
    </p>

    <ResponsiveAlertDialog
      v-model:open="isRemoveDialogOpen"
      :confirm-label="$t('settings.ai.customEndpoint.removeDialog.confirm')"
      confirm-variant="destructive"
      @confirm="confirmRemoveEndpoint"
    >
      <template #title>{{ $t('settings.ai.customEndpoint.removeDialog.title') }}</template>
      <template #description>
        {{ $t('settings.ai.customEndpoint.removeDialog.descriptionNamed', { name: endpoint.name }) }}
      </template>
    </ResponsiveAlertDialog>
  </div>
</template>

<script setup lang="ts">
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import ResponsiveMenu from '@/components/common/responsive-menu.vue';
import { Button } from '@/components/lib/ui/button';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { useNotificationCenter } from '@/components/notification-center';
import { useAiCustomEndpoints } from '@/composable/data-queries/use-ai-custom-endpoints';
import { useDateLocale } from '@/composable/use-date-locale';
import { extractApiErrorMessage } from '@/js/errors';
import { AICustomEndpointInfo } from '@bt/shared/types';
import {
  AlertCircleIcon,
  CheckCircleIcon,
  Loader2Icon,
  MoreVerticalIcon,
  PencilIcon,
  PlugZapIcon,
  Trash2Icon,
} from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  endpoint: AICustomEndpointInfo;
}>();

const emit = defineEmits<{
  (e: 'edit'): void;
}>();

const { t } = useI18n();
const { formatDistanceToNow } = useDateLocale();
const { addErrorNotification, addSuccessNotification } = useNotificationCenter();

const {
  removeCustomEndpoint,
  isRemovingCustomEndpoint,
  testCustomEndpointConnection,
  isTestingCustomEndpoint,
  invalidateCustomEndpoints,
} = useAiCustomEndpoints();

const isMenuOpen = ref(false);
const isRemoveDialogOpen = ref(false);

const isEndpointInvalid = computed(() => props.endpoint.status === 'invalid');
const isBusy = computed(() => isRemovingCustomEndpoint.value || isTestingCustomEndpoint.value);

const modelLabel = computed(() => t('settings.ai.customEndpoint.status.model', { model: props.endpoint.defaultModel }));

// Endpoints stored before status tracking carry no timestamps, and JSONB dates are unvalidated.
const statusDate = computed(() => {
  const info = props.endpoint;
  const isoDate = isEndpointInvalid.value ? (info.invalidatedAt ?? info.lastValidatedAt) : info.lastValidatedAt;
  if (!isoDate) return null;
  const date = new Date(isoDate);
  return Number.isNaN(date.getTime()) ? null : date;
});

const statusText = computed(() => {
  if (!statusDate.value) {
    return isEndpointInvalid.value
      ? t('settings.ai.customEndpoint.status.failedNoDate')
      : t('settings.ai.customEndpoint.status.validatedNoDate');
  }

  const timeAgo = formatDistanceToNow(statusDate.value, { addSuffix: true });
  return isEndpointInvalid.value
    ? t('settings.ai.customEndpoint.status.failed', { timeAgo })
    : t('settings.ai.customEndpoint.status.validated', { timeAgo });
});

const handleEdit = ({ close }: { close: () => void }) => {
  close();
  emit('edit');
};

const handleRemove = ({ close }: { close: () => void }) => {
  close();
  isRemoveDialogOpen.value = true;
};

const handleTest = async ({ close }: { close: () => void }) => {
  close();

  try {
    // Everything the probe needs is already stored, so the id alone is sent.
    const result = await testCustomEndpointConnection({ endpointId: props.endpoint.id });
    if (result.isValid) {
      addSuccessNotification(t('settings.ai.customEndpoint.test.success'));
    } else {
      addErrorNotification(result.error ?? t('settings.ai.customEndpoint.test.failed'));
    }
  } catch (error) {
    addErrorNotification(extractApiErrorMessage(error) ?? t('settings.ai.customEndpoint.test.failed'));
  }
};

const confirmRemoveEndpoint = async () => {
  isRemoveDialogOpen.value = false;

  try {
    await removeCustomEndpoint({ id: props.endpoint.id });
    addSuccessNotification(t('settings.ai.customEndpoint.notifications.removeSuccess'));
  } catch (error) {
    addErrorNotification(extractApiErrorMessage(error) ?? t('settings.ai.customEndpoint.notifications.removeFailed'));
    // The row may show an endpoint the server no longer has (removed in another tab), so refresh the list.
    invalidateCustomEndpoints();
  }
};
</script>
