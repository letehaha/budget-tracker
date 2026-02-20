<template>
  <div
    :class="{
      'input-field--error': errorMessage,
      'input-field--disabled': disabled,
    }"
    class="input-field"
  >
    <FieldLabel :label="label">
      <template #label-right>
        <template v-if="$slots['label-right']">
          <slot name="label-right" />
        </template>
      </template>

      <div class="relative">
        <template v-if="isLeadingIconExist">
          <div :class="['absolute top-0 left-0 flex h-full items-center px-6', leadingIconCssClass]">
            <slot name="iconLeading" />
          </div>
        </template>

        <input
          v-bind="{
            step: type === 'number' ? 'any' : undefined,
            ...computedAttrs,
          }"
          ref="inputFieldRef"
          :type="type"
          :value="displayValue"
          :style="inputFieldStyles"
          :disabled="disabled"
          :tabindex="tabindex"
          :min="minValue"
          :placeholder="placeholder"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          :class="
            cn(
              'border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50',
              isTrailIconExist && 'pr-12',
              (computedAttrs.class as string) ?? '',
            )
          "
        />

        <template v-if="isTrailIconExist">
          <div :class="cn('absolute top-0 right-0 flex h-full items-center px-6', trailingIconCssClass)">
            <slot name="iconTrailing" />
          </div>
        </template>
      </div>
    </FieldLabel>

    <template v-if="isSubLabelExist">
      <div class="absolute top-0 right-0 text-base font-normal [&_a]:text-white [&_a]:no-underline">
        <slot name="subLabel" />
      </div>
    </template>

    <FieldError :error-message="errorMessage" />
  </div>
</template>

<script lang="ts" setup>
import { cn } from '@/lib/utils';
import { HTMLAttributes, computed, onMounted, ref, useAttrs, watch } from 'vue';

import FieldError from './components/field-error.vue';
import FieldLabel from './components/field-label.vue';

enum MODEL_EVENTS {
  input = 'update:modelValue',
}

const props = defineProps<{
  label?: string;
  modelValue?: string | number | null;
  type?: string;
  disabled?: boolean;
  tabindex?: string;
  errorMessage?: string;
  inputFieldStyles?: HTMLAttributes['style'];
  onlyPositive?: boolean;
  autofocus?: boolean;
  trailingIconCssClass?: string;
  leadingIconCssClass?: string;
  placeholder?: string;
}>();

const emits = defineEmits<{
  (e: MODEL_EVENTS.input, payload: string | number | null): void;
}>();

const slots = defineSlots<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subLabel(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  iconTrailing(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  iconLeading(): any;
}>();
const attrs = useAttrs();

// For number inputs, we need to track the raw string value separately
// to preserve intermediate states like "1234.0" while typing "1234.03"
const rawNumberInput = ref<string>('');

// Determines if a string represents an incomplete decimal number
// (ends with decimal point or trailing zeros after decimal that would be lost in Number conversion)
const isIncompleteDecimal = (value: string): boolean => {
  if (!value) return false;
  // Ends with decimal point (e.g., "1234.")
  if (value.endsWith('.')) return true;
  // Has decimal point and ends with zero (e.g., "1234.0", "1234.00", "1234.10")
  if (value.includes('.') && value.endsWith('0')) return true;
  return false;
};

// The value to display in the input
const displayValue = computed(() => {
  if (props.type === 'number') {
    // Prefer raw input when it's an incomplete decimal (e.g. "5." or "5.0")
    // or when the model value would display in scientific notation (e.g. 0.0000001 → "1e-7")
    if (rawNumberInput.value && (isIncompleteDecimal(rawNumberInput.value) || String(props.modelValue).includes('e'))) {
      return rawNumberInput.value;
    }
    // Otherwise show the model value
    return props.modelValue ?? '';
  }
  return props.modelValue ?? '';
});

// Sync rawNumberInput when modelValue changes externally
watch(
  () => props.modelValue,
  (newValue) => {
    if (props.type === 'number') {
      // Only update raw input if it's not an incomplete decimal being typed
      const numericRaw = rawNumberInput.value === '' ? null : Number(rawNumberInput.value);
      if (numericRaw !== newValue) {
        rawNumberInput.value = newValue != null ? String(newValue) : '';
      }
    }
  },
);

const onInput = (event: Event) => {
  const target = event.target as HTMLInputElement;

  if (props.disabled) return;

  // For number inputs, preserve raw value to handle intermediate decimal states
  if (props.type === 'number') {
    rawNumberInput.value = target.value;
    const numValue = target.value === '' ? null : Number(target.value);
    if (props.modelValue === numValue) return;
    emits(MODEL_EVENTS.input, numValue);
  } else {
    const value: string = target.value;
    if (props.modelValue === value) return;
    emits(MODEL_EVENTS.input, value);
  }
};

const onKeypress = (event: KeyboardEvent) => {
  if (props.disabled) return;

  if (props.type === 'number') {
    // Prevent scientific notation (e.g., 1e5)
    if (event.key === 'e' || event.key === 'E') {
      event.preventDefault();
    }
  }
  if (props.onlyPositive) {
    // Prevent negative numbers
    if (['-', '+', '='].includes(event.key)) {
      event.preventDefault();
    }
  }
};

const computedAttrs = computed(() => ({
  ...attrs,
  class: attrs.class,
  onInput,
  onkeypress: onKeypress,
}));

const inputFieldRef = ref<HTMLInputElement | null>(null);
const minValue = computed<number>(() => {
  if (props.onlyPositive && !attrs.min) {
    return 0;
  }
  if (Number(attrs.min) < 0) {
    return 0;
  }

  return Number(attrs.min);
});

const isSubLabelExist = computed(() => !!slots.subLabel);
const isTrailIconExist = computed(() => !!slots.iconTrailing);
const isLeadingIconExist = computed(() => !!slots.iconLeading);

onMounted(() => {
  if (props.autofocus) {
    inputFieldRef.value.focus();
  }
});
</script>

<style scoped>
/* Hide number input spinners */
input[type='number']::-webkit-outer-spin-button,
input[type='number']::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

input[type='number'] {
  -moz-appearance: textfield;
}
</style>
