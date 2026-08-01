<template>
  <div>
    <!-- Label above the row so the apply error can grow without moving the Apply button. -->
    <label class="mb-1.5 block text-sm font-medium">
      {{ $t('settings.ai.modelSelector.customModel.nameLabel') }}
    </label>

    <div class="flex flex-col gap-3 @sm/feature-header:flex-row @sm/feature-header:items-start">
      <!-- Model ids in the rejection message have no spaces to wrap on. -->
      <div class="min-w-0 flex-1 [&_p]:break-words">
        <InputField
          v-model="modelName"
          :maxlength="AI_CUSTOM_MODEL_NAME_MAX_LENGTH"
          :placeholder="endpoint.defaultModel"
          :error-message="errorMessage ?? undefined"
        />
      </div>

      <!-- Applying probes the endpoint for the typed model, so it can run for several seconds -->
      <Button variant="outline" :disabled="!canApply" @click="handleApply">
        <Loader2Icon v-if="isApplying" class="size-4 animate-spin" />
        {{ $t('settings.ai.modelSelector.customModel.applyButton') }}
      </Button>
    </div>

    <p class="text-muted-foreground mt-1.5 text-xs">
      {{ $t('settings.ai.modelSelector.customModel.hint', { baseUrl: endpoint.baseUrl }) }}
    </p>
  </div>
</template>

<script setup lang="ts">
import InputField from '@/components/fields/input-field.vue';
import { Button } from '@/components/lib/ui/button';
import { AICustomEndpointInfo, AI_CUSTOM_MODEL_NAME_MAX_LENGTH } from '@bt/shared/types';
import { Loader2Icon } from '@lucide/vue';
import { computed } from 'vue';

const props = defineProps<{
  endpoint: AICustomEndpointInfo;
  /** Model already stored for this endpoint, so re-applying the same name is refused. */
  savedModelName: string;
  isApplying: boolean;
  /** Why the endpoint refused the last attempt. */
  errorMessage?: string | null;
}>();

const emit = defineEmits<{
  (e: 'apply', payload: { modelName: string }): void;
}>();

const modelName = defineModel<string>({ default: '' });

const trimmedModelName = computed(() => modelName.value.trim());

const canApply = computed(
  () => !props.isApplying && Boolean(trimmedModelName.value) && trimmedModelName.value !== props.savedModelName,
);

const handleApply = () => {
  if (!canApply.value) return;
  emit('apply', { modelName: trimmedModelName.value });
};
</script>
