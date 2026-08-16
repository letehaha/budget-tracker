<template>
  <component :is="onlyTemplate ? 'div' : 'label'" class="field-label">
    <template v-if="label">
      <div class="text-muted-foreground mb-1 flex items-center justify-between text-[13px]/[1.3] font-medium">
        <span class="flex items-center gap-1.5">
          <span>{{ label }}</span>
          <slot v-if="$slots['label-after']" name="label-after" />
        </span>

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
