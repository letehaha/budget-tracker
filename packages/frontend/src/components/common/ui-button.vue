<template>
  <button
    :type="type"
    :class="[
      `button button--${size} button--${theme}`,
      {
        'button--disabled': disabled,
        'button--is-icon': isIcon,
      },
    ]"
    :disabled="disabled"
    @click="$emit(EVENTS.click)"
  >
    <slot />
  </button>
</template>

<script lang="ts">
import { PropType, defineComponent } from 'vue';

enum EVENTS {
  click = 'click',
}

export type SIZES = 'default' | 'small';
export type BUTTON_THEMES = 'primary' | 'danger' | 'outline' | 'text' | 'light-dark';
export type BUTTON_TYPES = 'button' | 'submit' | 'reset';

export default defineComponent({
  name: 'ui-button',
  props: {
    type: {
      type: String as PropType<BUTTON_TYPES>,
      default: (): BUTTON_TYPES => 'button',
    },
    size: {
      type: String as PropType<SIZES>,
      default: (): SIZES => 'default',
    },
    theme: {
      type: String as PropType<BUTTON_THEMES>,
      default: (): BUTTON_THEMES => 'primary',
    },
    disabled: { type: Boolean, default: false },
    isIcon: { type: Boolean, default: false },
  },
  emits: Object.values(EVENTS),
  data: () => ({
    EVENTS,
  }),
});
</script>

<style lang="scss" scoped>
$transition: box-shadow 0.2s ease-out;

.button {
  font-weight: 400;
  letter-spacing: 0.5px;
  font-size: 16px;
  line-height: 1.2;
  border: 1px solid transparent;
  border-radius: var(--system-border-radius);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 32px;
  transition: 0.2s ease-out;

  &[disabled] {
    cursor: not-allowed;
  }
}

.button--is-icon {
  padding: 0;
  width: 40px;
  height: 40px;
}

.button--primary {
  background-color: var(--ac-button-primary-base);
  border-color: var(--ac-button-primary-base);
  color: var(--ac-button-primary-text);

  &:not([disabled]):hover {
    background-color: var(--ac-button-primary-hover);
    border-color: var(--ac-button-primary-hover);
  }
  &:focus {
    background-color: var(--ac-button-primary-focus);
    border-color: var(--ac-button-primary-focus);
  }
  &[disabled] {
    opacity: 0.3;
  }
}
.button--danger {
  background-color: var(--ac-button-danger-base);
  border-color: var(--ac-button-danger-base);
  color: var(--ac-button-danger-text);

  &:not([disabled]):hover {
    background-color: var(--ac-button-danger-hover);
    border-color: var(--ac-button-danger-hover);
  }
  &:focus {
    background-color: var(--ac-button-danger-focus);
    border-color: var(--ac-button-danger-focus);
  }
  &[disabled] {
    opacity: 0.3;
  }
}
.button--light-dark {
  background-color: #444;
  border-color: #444;
  color: var(--abc-text-white-base);

  &:not([disabled]):hover {
    background-color: lighten(#444, 5);
    border-color: lighten(#444, 5);
  }
  &:active {
    background-color: darken(#444, 5);
    border-color: darken(#444, 5);
  }
  &[disabled] {
    opacity: 0.5;
  }
}
.button--outline {
  background-color: transparent;
  border-color: var(--ac-button-primary-base);
  color: var(--ac-button-primary-base);

  &:not([disabled]):hover {
    border-color: var(--ac-button-primary-hover);
    color: var(--ac-button-primary-hover);
  }
  &:focus {
    border-color: var(--ac-button-primary-focus);
    color: var(--ac-button-primary-focus);
  }
  &[disabled] {
    opacity: 0.3;
  }
}
</style>
