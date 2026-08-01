<template>
  <ResponsiveDialog v-model:open="isOpen">
    <template #title>
      {{ isEditing ? $t('settings.ai.customEndpoint.form.titleEdit') : $t('settings.ai.customEndpoint.form.titleAdd') }}
    </template>

    <form class="@container/endpoint-dialog flex flex-col gap-4" @submit.prevent="handleSave">
      <InputField
        v-model="form.name"
        :maxlength="AI_CUSTOM_ENDPOINT_NAME_MAX_LENGTH"
        :label="$t('settings.ai.customEndpoint.form.nameLabel')"
        :placeholder="$t('settings.ai.customEndpoint.form.namePlaceholder')"
        @update:model-value="resetFeedback"
      />

      <InputField
        v-model="form.baseUrl"
        :label="$t('settings.ai.customEndpoint.form.baseUrlLabel')"
        :placeholder="$t('settings.ai.customEndpoint.form.baseUrlPlaceholder')"
        @update:model-value="resetFeedback"
      />

      <InputField
        v-model="form.defaultModel"
        :label="$t('settings.ai.customEndpoint.form.modelLabel')"
        :placeholder="$t('settings.ai.customEndpoint.form.modelPlaceholder')"
        @update:model-value="resetFeedback"
      />

      <Button
        type="button"
        variant="link"
        size="sm"
        class="h-auto self-start p-0 text-xs"
        @click="isSetupHelpOpen = true"
      >
        <CircleHelpIcon class="size-3.5" />
        {{ $t('settings.ai.customEndpoint.setupHelp.trigger') }}
      </Button>

      <div>
        <InputField
          v-model="form.apiKey"
          type="password"
          :label="$t('settings.ai.customEndpoint.form.apiKeyLabel')"
          :placeholder="$t('settings.ai.customEndpoint.form.apiKeyPlaceholder')"
          @update:model-value="resetFeedback"
        />
        <div v-if="hasSavedApiKey" class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <p class="text-muted-foreground text-xs">{{ $t('settings.ai.customEndpoint.form.apiKeySavedHint') }}</p>
          <Button
            type="button"
            variant="link"
            size="sm"
            class="h-auto p-0 text-xs"
            :disabled="isBusy"
            @click="isRemoveKeyDialogOpen = true"
          >
            {{ $t('settings.ai.customEndpoint.form.removeApiKeyButton') }}
          </Button>
        </div>
        <p v-else class="text-muted-foreground mt-1.5 text-xs">
          {{ $t('settings.ai.customEndpoint.form.apiKeyOptionalHint') }}
        </p>
      </div>

      <p v-if="formError" class="text-destructive-text text-sm">{{ formError }}</p>

      <div v-if="testResult" class="flex items-start gap-2 text-sm">
        <CheckCircleIcon v-if="testResult.isValid" class="text-success-text mt-0.5 size-4 shrink-0" />
        <AlertCircleIcon v-else class="text-destructive-text mt-0.5 size-4 shrink-0" />
        <span :class="testResult.isValid ? 'text-success-text' : 'text-destructive-text'">
          {{ testResult.message }}
        </span>
      </div>

      <div class="flex flex-col gap-2 pt-2 @sm/endpoint-dialog:flex-row @sm/endpoint-dialog:items-center">
        <Button type="button" variant="outline" :disabled="!canTest" @click="handleTest">
          <Loader2Icon v-if="isTestingCustomEndpoint" class="size-4 animate-spin" />
          <PlugZapIcon v-else class="size-4" />
          {{ $t('settings.ai.customEndpoint.form.testButton') }}
        </Button>

        <div class="flex flex-col gap-2 @sm/endpoint-dialog:ml-auto @sm/endpoint-dialog:flex-row">
          <Button type="button" variant="ghost" :disabled="isBusy" @click="isOpen = false">
            {{ $t('common.actions.cancel') }}
          </Button>
          <Button type="submit" :disabled="!canSubmit">
            <Loader2Icon v-if="isSaving" class="size-4 animate-spin" />
            {{
              isEditing ? $t('settings.ai.customEndpoint.form.saveButton') : $t('settings.ai.customEndpoint.addButton')
            }}
          </Button>
        </div>
      </div>
    </form>
  </ResponsiveDialog>

  <EndpointSetupHelp v-model:open="isSetupHelpOpen" />

  <ResponsiveAlertDialog
    v-model:open="isRemoveKeyDialogOpen"
    :confirm-label="$t('settings.ai.customEndpoint.removeKeyDialog.confirm')"
    confirm-variant="destructive"
    @confirm="confirmRemoveApiKey"
  >
    <template #title>{{ $t('settings.ai.customEndpoint.removeKeyDialog.title') }}</template>
    <template #description>{{ $t('settings.ai.customEndpoint.removeKeyDialog.description') }}</template>
  </ResponsiveAlertDialog>
</template>

<script setup lang="ts">
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import InputField from '@/components/fields/input-field.vue';
import { Button } from '@/components/lib/ui/button';
import { useNotificationCenter } from '@/components/notification-center';
import { useAiCustomEndpoints } from '@/composable/data-queries/use-ai-custom-endpoints';
import { extractApiErrorMessage } from '@/js/errors';
import { AICustomEndpointInfo, AI_CUSTOM_ENDPOINT_NAME_MAX_LENGTH } from '@bt/shared/types';
import { AlertCircleIcon, CheckCircleIcon, CircleHelpIcon, Loader2Icon, PlugZapIcon } from '@lucide/vue';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import EndpointSetupHelp from './endpoint-setup-help.vue';

const props = defineProps<{
  endpoint?: AICustomEndpointInfo | null;
}>();

const isOpen = defineModel<boolean>('open', { default: false });

const { t } = useI18n();
const { addSuccessNotification, addWarningNotification } = useNotificationCenter();

const {
  createCustomEndpoint,
  isCreatingCustomEndpoint,
  updateCustomEndpoint,
  isUpdatingCustomEndpoint,
  testCustomEndpointConnection,
  isTestingCustomEndpoint,
} = useAiCustomEndpoints();

const form = reactive({
  name: '',
  baseUrl: '',
  defaultModel: '',
  apiKey: '',
});

const formError = ref('');
const testResult = ref<{ isValid: boolean; message: string } | null>(null);
const isRemoveKeyDialogOpen = ref(false);
const isSetupHelpOpen = ref(false);

const resetFeedback = () => {
  formError.value = '';
  testResult.value = null;
};

// Seeded on open only, so a refetch from inside the dialog never overwrites what the user is typing.
watch(
  isOpen,
  (open) => {
    if (!open) return;
    const info = props.endpoint;
    form.name = info?.name ?? '';
    form.baseUrl = info?.baseUrl ?? '';
    form.defaultModel = info?.defaultModel ?? '';
    form.apiKey = '';
    isRemoveKeyDialogOpen.value = false;
    isSetupHelpOpen.value = false;
    resetFeedback();
  },
  { immediate: true },
);

const isEditing = computed(() => Boolean(props.endpoint));
const hasSavedApiKey = computed(() => props.endpoint?.hasApiKey ?? false);

const isSaving = computed(() => isCreatingCustomEndpoint.value || isUpdatingCustomEndpoint.value);
const isBusy = computed(() => isSaving.value || isTestingCustomEndpoint.value);

const hasConnectionFields = computed(() => Boolean(form.baseUrl.trim() && form.defaultModel.trim()));
const canSubmit = computed(() => hasConnectionFields.value && Boolean(form.name.trim()) && !isBusy.value);
// Blank fields fall back to the saved endpoint, so an existing one can be tested without retyping.
const canTest = computed(() => (hasConnectionFields.value || isEditing.value) && !isBusy.value);

const handleSave = async () => {
  if (!canSubmit.value) return;

  resetFeedback();

  const typedKey = form.apiKey.trim();
  const payload = {
    name: form.name.trim(),
    baseUrl: form.baseUrl.trim(),
    defaultModel: form.defaultModel.trim(),
    // A blank field keeps whatever key is already stored
    apiKey: typedKey || undefined,
  };

  try {
    if (props.endpoint) {
      await updateCustomEndpoint({ id: props.endpoint.id, ...payload });
    } else {
      await createCustomEndpoint(payload);
    }
    form.apiKey = '';
    addSuccessNotification(t('settings.ai.customEndpoint.notifications.saveSuccess'));
    isOpen.value = false;
  } catch (error) {
    formError.value = extractApiErrorMessage(error) ?? t('settings.ai.customEndpoint.notifications.saveFailed');
  }
};

const handleTest = async () => {
  if (!canTest.value) return;

  resetFeedback();

  const typedKey = form.apiKey.trim();
  const baseUrl = form.baseUrl.trim();
  const defaultModel = form.defaultModel.trim();
  const savedEndpoint = props.endpoint;

  try {
    const result = await testCustomEndpointConnection(
      savedEndpoint
        ? {
            endpointId: savedEndpoint.id,
            baseUrl: baseUrl || undefined,
            defaultModel: defaultModel || undefined,
            apiKey: typedKey || undefined,
          }
        : { baseUrl, defaultModel, apiKey: typedKey || undefined },
    );
    testResult.value = {
      isValid: result.isValid,
      message: result.isValid
        ? t('settings.ai.customEndpoint.test.success')
        : (result.error ?? t('settings.ai.customEndpoint.test.failed')),
    };
  } catch (error) {
    testResult.value = {
      isValid: false,
      message: extractApiErrorMessage(error) ?? t('settings.ai.customEndpoint.test.failed'),
    };
  }
};

const confirmRemoveApiKey = async () => {
  isRemoveKeyDialogOpen.value = false;
  if (!props.endpoint) return;

  resetFeedback();

  try {
    // Only `apiKey: null` is sent: omitted fields keep their stored values, and the
    // form may hold edits the user has not saved yet.
    const updated = await updateCustomEndpoint({ id: props.endpoint.id, apiKey: null });
    form.apiKey = '';

    // The key is dropped even if the endpoint stops answering without it, so a 200 can come back invalid.
    if (updated.status === 'invalid') {
      const message = t('settings.ai.customEndpoint.notifications.removeKeyInvalid', {
        reason: updated.lastError ?? t('settings.ai.customEndpoint.test.failed'),
      });
      formError.value = message;
      addWarningNotification(message);
      return;
    }

    addSuccessNotification(t('settings.ai.customEndpoint.notifications.removeKeySuccess'));
  } catch (error) {
    formError.value = extractApiErrorMessage(error) ?? t('settings.ai.customEndpoint.notifications.removeKeyFailed');
  }
};
</script>
