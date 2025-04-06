<template>
  <div
    class="text-field"
    :class="{
      'text-field--error': errorMessage,
      'text-field--disabled': disabled,
      'text-field--readonly': readonly,
      'text-field--dirty': hasValue,
    }"
  >
    <FieldLabel :label="label">
      <template #label-right>
        <template v-if="$slots['label-right']">
          <slot name="label-right" />
        </template>
      </template>

      <textarea
        :class="
          cn(
            'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
            $attrs.class ?? '',
          )
        "
        :placeholder="placeholder || ''"
        :value="modelValue"
        :disabled="disabled"
        :name="name"
        :autofocus="autofocus"
        :maxlength="maxlength"
        :required="required"
        :readonly="readonly"
        :title="title"
        :rows="rows"
        :cols="cols"
        @input="onInput"
      />
    </FieldLabel>

    <span v-if="maxlength" class="text-field__length">
      {{ `${currentLength}/${maxlength}` }}
    </span>

    <FieldError :error-message="errorMessage" />
  </div>
</template>

<script lang="ts" setup>
import { FieldError, FieldLabel } from '@/components/fields';
import { cn } from '@/lib/utils';
import { computed, onMounted, ref } from 'vue';

interface InputChangeEvent extends InputEvent {
  target: HTMLInputElement;
}

const MODEL_EVENTS = Object.freeze({
  input: 'update:modelValue',
});

const emit = defineEmits<{
  (e: 'update:modelValue', payload: string | number): void;
}>();

const props = withDefaults(
  defineProps<{
    label?: string;
    modelValue?: string | number;
    errorMessage?: string;
    // proxies
    autocomplete?: string;
    autofocus?: boolean;
    disabled?: boolean;
    name?: string;
    placeholder?: string;
    required?: boolean;
    readonly?: boolean;
    title?: string;
    maxlength?: string | number;
    // textarea proxies
    rows?: string | number;
    cols?: string | number;
  }>(),
  {
    label: undefined,
    autocomplete: 'off',
    autofocus: false,
    rows: 4,
    modelValue: '',
    errorMessage: undefined,
    name: undefined,
    placeholder: undefined,
    title: undefined,
    maxlength: undefined,
    cols: undefined,
  },
);

const currentLength = ref(0);
const hasValue = computed(() => props.modelValue);

onMounted(() => {
  if (props.modelValue) currentLength.value = String(props.modelValue).length;
});

const onInput = (event: InputChangeEvent) => {
  if (props.maxlength) currentLength.value = event.target.value.length;
  emit(MODEL_EVENTS.input, event.target.value);
};
</script>

<style lang="scss">
.text-field {
  position: relative;
  width: 100%;
  flex: 1;

  &--disabled,
  &--readonly {
    filter: grayscale(100%);
    border-style: dashed;
  }
}

.text-field__input {
  width: 100%;
  position: relative;
  padding: 16px 16px 24px;
  caret-color: var(--app-on-surface-color);
  background-color: var(--app-surface-color);
  border: 1px solid var(--app-on-surface-color);
  border-radius: 4px;
  transition:
    all 0s,
    border-color 0.2s ease-out;
  resize: none;
  color: var(--app-on-surface-color);
}
</style>
