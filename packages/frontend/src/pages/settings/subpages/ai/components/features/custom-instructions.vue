<template>
  <div class="mt-4 border-t pt-4">
    <div class="mb-2 flex items-center gap-2">
      <MessageSquareTextIcon class="text-muted-foreground size-4" />
      <h5 class="text-sm font-medium">{{ $t('settings.ai.customInstructions.title') }}</h5>
    </div>

    <p class="text-muted-foreground mb-3 text-xs leading-relaxed">
      {{ $t('settings.ai.customInstructions.description') }}
    </p>

    <TextareaField
      v-model="localInstructions"
      :placeholder="$t('settings.ai.customInstructions.placeholder')"
      :disabled="!hasAnyApiKey"
      :maxlength="MAX_CHARS"
      rows="4"
    />

    <!-- Disabled state warning -->
    <div
      v-if="!hasAnyApiKey"
      class="mt-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 dark:border-amber-900 dark:bg-amber-950"
    >
      <AlertTriangleIcon class="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
      <p class="text-xs text-amber-700 dark:text-amber-300">
        {{ $t('settings.ai.customInstructions.requiresApiKey') }}
      </p>
    </div>

    <!-- Save button -->
    <div v-if="hasAnyApiKey" class="mt-3 flex items-center gap-3">
      <Button size="sm" :disabled="!hasChanges || isSaving" @click="handleSave">
        <Loader2Icon v-if="isSaving" class="mr-1.5 size-3.5 animate-spin" />
        {{ $t('settings.ai.customInstructions.save') }}
      </Button>

      <Transition
        enter-active-class="transition-opacity duration-200"
        leave-active-class="transition-opacity duration-200"
        enter-from-class="opacity-0"
        leave-to-class="opacity-0"
      >
        <span v-if="showSuccess" class="text-success-text text-xs">
          {{ $t('settings.ai.customInstructions.saved') }}
        </span>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { TextareaField } from '@/components/fields';
import { Button } from '@/components/lib/ui/button';
import { useNotificationCenter } from '@/components/notification-center';
import { useAiSettings } from '@/composable/data-queries/ai-settings';
import { AI_CUSTOM_INSTRUCTIONS_MAX_LENGTH } from '@bt/shared/types';
import { AlertTriangleIcon, Loader2Icon, MessageSquareTextIcon } from 'lucide-vue-next';
import { computed, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const MAX_CHARS = AI_CUSTOM_INSTRUCTIONS_MAX_LENGTH;

const { t } = useI18n();
const { addErrorNotification } = useNotificationCenter();
const {
  hasAnyApiKey,
  customInstructions,
  setCustomInstructions,
  isSettingCustomInstructions: isSaving,
} = useAiSettings();

const localInstructions = ref('');
const isSyncingFromRemote = ref(false);
const userHasEdited = ref(false);
const showSuccess = ref(false);
let successTimeout: ReturnType<typeof setTimeout> | undefined;

const hasChanges = computed(() => {
  const saved = customInstructions.value ?? '';
  return localInstructions.value !== saved;
});

// Track when the user manually edits the textarea (not programmatic syncs)
watch(localInstructions, () => {
  if (!isSyncingFromRemote.value) {
    userHasEdited.value = true;
  }
});

// Sync local state when remote data loads, but only if user hasn't started editing
watch(
  customInstructions,
  (value) => {
    if (!userHasEdited.value) {
      isSyncingFromRemote.value = true;
      localInstructions.value = value ?? '';
      isSyncingFromRemote.value = false;
    }
  },
  { immediate: true },
);

onUnmounted(() => clearTimeout(successTimeout));

const handleSave = async () => {
  try {
    await setCustomInstructions({ instructions: localInstructions.value });
    userHasEdited.value = false;
    showSuccess.value = true;

    clearTimeout(successTimeout);
    const SUCCESS_DISPLAY_MS = 3000;
    successTimeout = setTimeout(() => {
      showSuccess.value = false;
    }, SUCCESS_DISPLAY_MS);
  } catch (error) {
    const message =
      (error as { response?: { message?: string } })?.response?.message ??
      t('settings.ai.customInstructions.saveFailed');
    addErrorNotification(message);
  }
};
</script>
