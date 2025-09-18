<template>
  <div class="group relative">
    <slot />

    <template v-if="content || $refs['tooltip-content'] || $refs['tooltip-message']">
      <div
        class="invisible absolute left-1/2 -translate-x-1/2 opacity-0 transition-all duration-200 ease-out group-hover:visible group-hover:opacity-100"
        :class="position === 'top' ? 'bottom-full mb-[5px]' : 'top-full mt-[5px]'"
      >
        <slot name="tooltip-content">
          <div class="w-max max-w-[200px] rounded-lg bg-black/[0.98] p-2 text-center text-xs text-white">
            <slot name="tooltip-message">
              {{ content }}
            </slot>
          </div>
        </slot>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
defineOptions({
  name: 'ui-tooltip',
});

withDefaults(
  defineProps<{
    content?: string;
    position?: 'bottom' | 'top';
  }>(),
  {
    content: undefined,
    position: 'bottom',
  },
);
</script>
