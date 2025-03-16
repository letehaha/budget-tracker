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
          <div :class="['absolute top-0 left-0 flex items-center h-full px-6', leadingIconCssClass]">
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
          :value="modelValue"
          :style="inputFieldStyles"
          :disabled="disabled"
          :tabindex="tabindex"
          :min="minValue"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          :class="
            cn(
              'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
              computedAttrs.class ?? '',
            )
          "
        />

        <template v-if="isTrailIconExist">
          <div :class="['absolute top-0 right-0 flex items-center h-full px-6', trailingIconCssClass]">
            <slot name="iconTrailing" />
          </div>
        </template>
      </div>
    </FieldLabel>

    <template v-if="isSubLabelExist">
      <div class="input-fields__sublabel">
        <slot name="subLabel" />
      </div>
    </template>

    <FieldError :error-message="errorMessage" />
  </div>
</template>

<script lang="ts" setup>
import { KEYBOARD_CODES } from '@/common/types';
import { cn } from '@/lib/utils';
import { HTMLAttributes, computed, onMounted, ref, useAttrs } from 'vue';

import FieldError from './components/field-error.vue';
import FieldLabel from './components/field-label.vue';

enum MODEL_EVENTS {
  input = 'update:modelValue',
}

interface InputChangeEvent extends Event {
  target: HTMLInputElement;
}

const props = defineProps<{
  label?: string;
  modelValue?: string | number;
  type?: string;
  disabled?: boolean;
  tabindex?: string;
  errorMessage?: string;
  inputFieldStyles?: HTMLAttributes['style'];
  onlyPositive?: boolean;
  autofocus?: boolean;
  trailingIconCssClass?: string;
  leadingIconCssClass?: string;
}>();

const emits = defineEmits<{
  (e: MODEL_EVENTS.input, payload: string | number): void;
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

const computedAttrs = {
  ...attrs,
  class: attrs.class,
  onInput: (event: InputChangeEvent) => {
    const value: string = event.target.value;

    if (props.disabled) return;
    if (props.modelValue === value) return;

    emits(MODEL_EVENTS.input, value);
  },
  onkeypress: (event: KeyboardEvent) => {
    if (props.disabled) return;

    if (props.type === 'number') {
      if (event.keyCode === KEYBOARD_CODES.keyE) {
        event.preventDefault();
      }
    }
    if (props.onlyPositive) {
      if ([KEYBOARD_CODES.minus, KEYBOARD_CODES.equal, KEYBOARD_CODES.plus].includes(event.keyCode)) {
        event.preventDefault();
      }
    }
  },
};

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

<style lang="scss">
.input-fields__sublabel {
  position: absolute;
  right: 0;
  top: 0;
  font-size: 16px;
  font-weight: 400;
  color: rgba(var(--app-on-surface-color-rgb), 0.95);

  a {
    color: #ffffff;
    text-decoration: none;
  }
}
</style>
