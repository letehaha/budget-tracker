<template>
  <FieldLabel :label="label">
    <template v-if="$slots['label-right']" #label-right>
      <slot name="label-right" />
    </template>
    <div class="relative">
      <input
        ref="inputRef"
        type="text"
        inputmode="decimal"
        :value="displayValue"
        :placeholder="placeholder"
        :disabled="disabled"
        autocomplete="off"
        spellcheck="false"
        :class="
          cn(
            'border-input bg-input-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm tabular-nums focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50',
            errorMessage && 'border-destructive',
          )
        "
        @input="onInput"
        @blur="emit('blur')"
      />
    </div>
    <FieldError :error-message="errorMessage" />
  </FieldLabel>
</template>

<script setup lang="ts">
import FieldError from '@/components/fields/components/field-error.vue';
import FieldLabel from '@/components/fields/components/field-label.vue';
import {
  caretOffsetAfterDigits,
  countDigitsBeforeCaret,
  getAmountSeparators,
  parseAmountInput,
} from '@/components/fields/utils/formatted-amount';
import { cn } from '@/lib/utils';
import { computed, nextTick, ref } from 'vue';

const props = defineProps<{
  modelValue: number | null;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  errorMessage?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: number | null];
  blur: [];
}>();

const inputRef = ref<HTMLInputElement | null>(null);

// Display-only tail the numeric model can't represent — a trailing decimal
// point or trailing decimal zeros ("1234." / "1234.50") — so the input keeps
// rendering exactly what the user typed mid-edit.
const trailingFragment = ref<string>('');

const separators = getAmountSeparators();

// Browser-locale grouping/decimal separators, matching the rest of the app's
// number rendering (e.g. the min-payment estimate in the loan form).
const formatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

const formatNumber = (value: number): string => {
  if (Number.isNaN(value)) return '';
  return formatter.format(value);
};

const displayValue = computed(() => {
  if (props.modelValue === null || props.modelValue === undefined) return '';
  // The fragment is stored with a canonical '.' — render it with the locale's
  // decimal separator so it matches the formatter's output.
  const fragment = trailingFragment.value.replace('.', separators.decimal);
  return `${formatNumber(props.modelValue)}${fragment}`;
});

const onInput = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const raw = target.value;
  const caretBefore = target.selectionStart ?? raw.length;
  const digitsBeforeCaret = countDigitsBeforeCaret({
    text: raw,
    caret: caretBefore,
    decimalSeparator: separators.decimal,
  });

  const { fragment, numeric } = parseAmountInput({ raw, decimalSeparator: separators.decimal });
  trailingFragment.value = fragment;

  if (numeric !== props.modelValue) {
    emit('update:modelValue', numeric);
  }

  // The displayValue computed reruns after the prop update, but the DOM
  // doesn't refresh until the next tick — restore the caret then.
  nextTick(() => {
    const formatted = displayValue.value;
    const nextCaret = caretOffsetAfterDigits({
      text: formatted,
      digitCount: digitsBeforeCaret,
      decimalSeparator: separators.decimal,
    });
    inputRef.value?.setSelectionRange(nextCaret, nextCaret);
  });
};
</script>
