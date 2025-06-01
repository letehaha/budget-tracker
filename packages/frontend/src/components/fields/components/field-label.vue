<template>
  <component :is="onlyTemplate ? 'div' : 'label'" class="field-label">
    <template v-if="label">
      <div class="field-label__label">
        <span>{{ label }}</span>

        <template v-if="$slots['label-right']">
          <slot name="label-right" />
        </template>
      </div>
    </template>
    <div class="field-label__field-wrapper">
      <slot />
    </div>
  </component>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  props: {
    label: { type: String, default: undefined },
    // Used in case you want omit using `label` but still need to use styles and
    // template. For example when `label` triggers unnecessary cliks of buttons inside
    onlyTemplate: { type: Boolean, default: false },
  },
});
</script>

<style lang="scss">
.field-label__label {
  font-size: 16px;
  font-weight: 400;
  letter-spacing: 0.5px;
  line-height: 1;
  margin-bottom: 5px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.field-label__field-wrapper {
  position: relative;
}
</style>
