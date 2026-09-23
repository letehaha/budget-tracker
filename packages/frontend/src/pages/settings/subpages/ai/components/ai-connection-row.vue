<template>
  <div class="rounded-lg border p-3" :class="{ 'border-destructive/50 bg-destructive/5': isInvalid }">
    <div class="flex items-start gap-3">
      <Loader2Icon v-if="isTestingConnection" class="text-muted-foreground mt-0.5 size-5 shrink-0 animate-spin" />
      <CredentialStatus
        v-else
        :status="connection.status"
        :last-validated-at="connection.lastValidatedAt"
        :invalidated-at="connection.invalidatedAt"
      />

      <!-- Wide layout: name and model share a line, and `w-full` on the base URL pushes it
      onto its own. -->
      <div
        class="flex min-w-0 flex-1 flex-col gap-0.5 @md/ai-connections:flex-row @md/ai-connections:flex-wrap @md/ai-connections:items-baseline @md/ai-connections:gap-x-3"
      >
        <div class="flex min-w-0 flex-wrap items-center gap-2 @md/ai-connections:flex-1">
          <DesktopOnlyTooltip :content="connection.name" only-when-truncated>
            <span class="truncate text-sm font-medium">{{ connection.name }}</span>
          </DesktopOnlyTooltip>
          <span
            v-if="isDefault"
            :class="
              cn(
                'shrink-0 rounded-full px-2 py-0.5 text-xs',
                isInvalid ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary-text',
              )
            "
          >
            {{
              isInvalid
                ? $t('settings.ai.connections.badges.defaultSkipped')
                : $t('settings.ai.connections.badges.default')
            }}
          </span>
          <span
            v-if="isInvalid"
            class="bg-destructive/10 text-destructive-text shrink-0 rounded-full px-2 py-0.5 text-xs"
          >
            {{ $t('settings.ai.credentialStatus.invalidBadge') }}
          </span>
        </div>

        <DesktopOnlyTooltip v-if="connection.baseUrl" :content="connection.baseUrl" only-when-truncated>
          <span class="text-muted-foreground truncate text-xs @md/ai-connections:order-3 @md/ai-connections:w-full">
            {{ connection.baseUrl }}
          </span>
        </DesktopOnlyTooltip>

        <DesktopOnlyTooltip :content="modelLabel" only-when-truncated>
          <span
            class="text-muted-foreground min-w-0 truncate text-xs @md/ai-connections:order-2 @md/ai-connections:max-w-[40%]"
          >
            {{ modelLabel }}
          </span>
        </DesktopOnlyTooltip>
      </div>

      <DesktopOnlyTooltip :content="$t('settings.ai.connections.actions.menuAriaLabel')">
        <span class="inline-flex shrink-0">
          <ResponsiveMenu v-model:open="isMenuOpen">
            <template #trigger>
              <Button
                variant="ghost"
                size="icon-sm"
                class="shrink-0"
                :aria-label="$t('settings.ai.connections.actions.menuAriaLabel')"
              >
                <MoreVerticalIcon class="size-4" />
              </Button>
            </template>

            <template #default="{ close }">
              <Button
                variant="ghost"
                size="sm"
                class="w-full justify-start gap-2"
                @click="runAndClose({ close, action: () => emit('edit') })"
              >
                <PencilIcon class="size-4" />
                {{ $t('common.actions.edit') }}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                class="w-full justify-start gap-2"
                :disabled="!canDuplicate"
                @click="runAndClose({ close, action: () => emit('duplicate') })"
              >
                <CopyIcon class="size-4" />
                {{ $t('settings.ai.connections.actions.duplicate') }}
              </Button>

              <Button
                v-if="!isDefault"
                variant="ghost"
                size="sm"
                class="w-full justify-start gap-2"
                :disabled="isBusy"
                @click="runAndClose({ close, action: handleSetDefault })"
              >
                <StarIcon class="size-4" />
                {{ $t('settings.ai.connections.actions.setDefault') }}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                class="w-full justify-start gap-2"
                :disabled="isBusy"
                @click="runAndClose({ close, action: runConnectionTest })"
              >
                <PlugZapIcon class="size-4" />
                {{ $t('settings.ai.connections.form.testButton') }}
              </Button>

              <Separator class="my-1" />

              <Button
                variant="ghost"
                size="sm"
                class="text-destructive-text hover:text-destructive-text w-full justify-start gap-2"
                :disabled="isBusy"
                @click="runAndClose({ close, action: () => (isRemoveDialogOpen = true) })"
              >
                <Trash2Icon class="size-4" />
                {{ $t('settings.ai.connections.actions.remove') }}
              </Button>
            </template>
          </ResponsiveMenu>
        </span>
      </DesktopOnlyTooltip>
    </div>

    <div v-if="isInvalid" class="mt-2 space-y-2">
      <p v-if="connection.lastError" class="text-destructive-text text-xs break-words">
        {{ connection.lastError }}
      </p>

      <!-- Nothing to retry without a key, so the way out is entering one. -->
      <Button v-if="needsKey" variant="outline" size="sm" @click="emit('edit')">
        <KeyIcon class="size-4" />
        {{ $t('settings.ai.connections.actions.enterKey') }}
      </Button>
      <Button v-else variant="outline" size="sm" :disabled="isBusy" @click="runConnectionTest">
        <RotateCwIcon class="size-4" :class="{ 'animate-spin': isTestingConnection }" />
        {{ $t('settings.ai.connections.actions.reconnect') }}
      </Button>
    </div>

    <ResponsiveAlertDialog
      v-model:open="isRemoveDialogOpen"
      :confirm-label="$t('settings.ai.connections.removeDialog.confirm')"
      confirm-variant="destructive"
      @confirm="confirmRemove"
    >
      <template #title>{{ $t('settings.ai.connections.removeDialog.title') }}</template>
      <template #description>
        {{ $t('settings.ai.connections.removeDialog.description', { name: connection.name }) }}
        <template v-if="pinnedFeatureNames.length">
          {{ $t('settings.ai.connections.removeDialog.pinnedFeatures', { features: pinnedFeatureNames.join(', ') }) }}
        </template>
      </template>
    </ResponsiveAlertDialog>
  </div>
</template>

<script setup lang="ts">
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import ResponsiveMenu from '@/components/common/responsive-menu.vue';
import { Button } from '@/components/lib/ui/button';
import { Separator } from '@/components/lib/ui/separator';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { useNotificationCenter } from '@/components/notification-center';
import { useAiConnections } from '@/composable/data-queries/use-ai-connections';
import { extractApiErrorMessage } from '@/js/errors';
import { cn } from '@/lib/utils';
import { AIConnectionInfo } from '@bt/shared/types';
import {
  CopyIcon,
  KeyIcon,
  Loader2Icon,
  MoreVerticalIcon,
  PencilIcon,
  PlugZapIcon,
  RotateCwIcon,
  StarIcon,
  Trash2Icon,
} from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { findPresetForConnection } from '../presets';
import CredentialStatus from './shared/credential-status.vue';

const props = defineProps<{
  connection: AIConnectionInfo;
  isDefault: boolean;
  canDuplicate: boolean;
  pinnedFeatureNames: string[];
}>();

const emit = defineEmits<{
  (e: 'edit'): void;
  (e: 'duplicate'): void;
}>();

const { t } = useI18n();
const { addErrorNotification, addSuccessNotification } = useNotificationCenter();

const {
  removeConnection,
  isRemovingConnection,
  setDefaultConnection,
  isSettingDefaultConnection,
  testConnection,
  isTestingConnection,
  invalidateConnections,
} = useAiConnections();

const isMenuOpen = ref(false);
const isRemoveDialogOpen = ref(false);

const isInvalid = computed(() => props.connection.status === 'invalid');
const preset = computed(() => findPresetForConnection({ connection: props.connection }));
const needsKey = computed(() => preset.value.keyRequired && !props.connection.hasApiKey);
const isBusy = computed(
  () => isRemovingConnection.value || isTestingConnection.value || isSettingDefaultConnection.value,
);

const modelLabel = computed(() =>
  t('settings.ai.connections.status.model', {
    provider: t(preset.value.labelKey),
    model: props.connection.model,
  }),
);

const runAndClose = ({ close, action }: { close: () => void; action: () => unknown }) => {
  close();
  action();
};

const runConnectionTest = async () => {
  try {
    const result = await testConnection({ connectionId: props.connection.id });
    if (result.isValid) {
      addSuccessNotification(t('settings.ai.connections.test.success'));
    } else {
      addErrorNotification(result.error);
    }
  } catch (error) {
    addErrorNotification(extractApiErrorMessage(error) ?? t('settings.ai.connections.test.failed'));
  } finally {
    // The server records a stored connection's verdict, so the rows go stale whatever the outcome.
    invalidateConnections();
  }
};

const handleSetDefault = async () => {
  try {
    await setDefaultConnection({ id: props.connection.id });
    addSuccessNotification(
      t('settings.ai.connections.notifications.setDefaultSuccess', { name: props.connection.name }),
    );
  } catch (error) {
    addErrorNotification(extractApiErrorMessage(error) ?? t('settings.ai.connections.notifications.setDefaultFailed'));
  }
};

const confirmRemove = async () => {
  isRemoveDialogOpen.value = false;

  try {
    await removeConnection({ id: props.connection.id });
    addSuccessNotification(t('settings.ai.connections.notifications.removeSuccess'));
  } catch (error) {
    addErrorNotification(extractApiErrorMessage(error) ?? t('settings.ai.connections.notifications.removeFailed'));
  }
};
</script>
