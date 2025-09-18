<template>
  <component :is="onlyTemplate ? 'div' : 'label'" class="field-label">
    <template v-if="label">
      <div class="mb-[5px] flex items-center justify-between text-base leading-none font-normal tracking-wide">
        <span>{{ label }}</span>

        <template v-if="$slots['label-right']">
          <slot name="label-right" />
        </template>
      </div>
    </template>
    <div class="relative">
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
