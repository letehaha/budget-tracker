<script setup lang="ts">
import InputField from '@/components/fields/input-field.vue';
import { Button } from '@/components/lib/ui/button';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { XIcon } from '@lucide/vue';
import { ref } from 'vue';

const props = defineProps<{ modelValue: string[]; max: number; maxLength: number; placeholder: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>();

const draft = ref('');

// Rejected input stays in the field so the user can fix it instead of losing what they typed.
const commit = () => {
  const keyword = draft.value.trim().slice(0, props.maxLength);
  if (!keyword || props.modelValue.includes(keyword) || props.modelValue.length >= props.max) return;
  draft.value = '';
  emit('update:modelValue', [...props.modelValue, keyword]);
};

const removeAt = ({ index }: { index: number }) =>
  emit(
    'update:modelValue',
    props.modelValue.filter((_, i) => i !== index),
  );

// Listens on the wrapper: the input's own attrs also land on this element, so binding
// the handler to InputField would run it twice per keystroke.
const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter' || event.key === ',') {
    event.preventDefault();
    commit();
  } else if (event.key === 'Backspace' && !draft.value && props.modelValue.length) {
    removeAt({ index: props.modelValue.length - 1 });
  }
};
</script>

<template>
  <div class="flex flex-col gap-1.5" @keydown="onKeydown" @focusout="commit">
    <InputField
      v-model="draft"
      :placeholder="placeholder"
      :disabled="modelValue.length >= max"
      :maxlength="maxLength"
    />

    <div v-if="modelValue.length" class="flex flex-wrap gap-1">
      <DesktopOnlyTooltip
        v-for="(keyword, index) in modelValue"
        :key="keyword"
        :content="$t('automations.editor.removeKeyword')"
      >
        <Button
          type="button"
          variant="ghost"
          class="bg-muted hover:bg-destructive/15 hover:text-destructive-text h-auto gap-1 rounded-full py-0.5 pr-1.5 pl-2.5 text-xs font-normal"
          :aria-label="`${$t('automations.editor.removeKeyword')}: ${keyword}`"
          @click="removeAt({ index })"
        >
          {{ keyword }}
          <XIcon class="size-3" />
        </Button>
      </DesktopOnlyTooltip>
    </div>
  </div>
</template>
