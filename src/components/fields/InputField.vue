<template>
  <div
    :class="{
      'input-field--error': errorMessage,
      'input-field--disabled': $attrs.disabled
    }"
    class="input-field"
  >
    <span
      v-if="label"
      class="input-field__label"
    >
      {{ label }}
    </span>
    <input
      :type="type"
      :value="modelValue"
      :placeholder="$attrs.placeholder || ''"
      :style="inputFieldStyles"
      :tabindex="tabindex"
      v-bind="attrs"
      class="input-field__input"
      autocomplete="off"
      autocorrect="off"
      autocapitalize="off"
      spellcheck="false"
    >
    <div
      v-if="isSubLabelExist"
      class="input-fields__sublabel"
    >
      <slot name="subLabel" />
    </div>
    <p
      v-if="errorMessage"
      class="input-field__err-mes"
    >
      {{ errorMessage }}
    </p>
  </div>
</template>

<script>

const MODEL_EVENTS = {
  input: 'update:modelValue',
};

export default {
  props: {
    label: { type: String, default: undefined },
    modelValue: { type: [String, Number], default: undefined },
    type: { type: String, default: undefined },
    tabindex: { type: String, default: undefined },
    errorMessage: { type: String, default: undefined },
    inputFieldStyles: { type: Object, default: undefined },
  },
  computed: {
    attrs() {
      return {
        ...this.$attrs,
        onInput: event => {
          if (this.modelValue === event.target.value) return;
          this.$emit(MODEL_EVENTS.input, event.target.value);
        },
      };
    },
    isSubLabelExist() {
      return !!this.$slots.subLabel;
    },
  },
  methods: {

  },
};
</script>

<style lang="scss">
.input-field {
  position: relative;
  width: 100%;
  flex: 1;
}
.input-field__input {
  font-size: 16px;
  line-height: 1;
  color: var(--primary-text-color);
  font-weight: 400;
  letter-spacing: 0.5px;
  padding: 12px 24px;
  background-color: #fff;
  border: 1px solid #acafb3;
  box-sizing: border-box;
  border-radius: var(--system-border-radius);
  outline: none;
  width: 100%;

  @include placeholder-custom(rgba(#333, 0.6));
}
.input-field__label {
  font-size: 16px;
  font-weight: 400;
  letter-spacing: 0.5px;
  line-height: 1;
  color: var(--primary-text-color);
  margin-bottom: 5px;
  display: block;
}
.input-field__err-mes {
  color: red;
  font-size: 14px;
  margin-top: 4px;
  margin-left: 8px;
}
.input-fields__sublabel {
  position: absolute;
  right: 0;
  top: 0;
  font-size: 16px;
  font-weight: 400;
  color: #000000;

  a {
    color: #ffffff;
    text-decoration: none;
  }
}
</style>
