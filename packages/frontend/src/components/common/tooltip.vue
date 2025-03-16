<template>
  <div class="ui-tooltip" :class="[`ui-tooltip--${position}`]">
    <slot />

    <template v-if="content || $refs['tooltip-content'] || $refs['tooltip-message']">
      <div class="ui-tooltip__content-wrapper">
        <slot name="tooltip-content">
          <div class="ui-tooltip__content">
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

<style lang="scss">
.ui-tooltip {
  position: relative;
}
.ui-tooltip__content-wrapper {
  position: absolute;

  opacity: 0;
  visibility: hidden;
  transition: 0.2s ease-out;

  .ui-tooltip:hover & {
    opacity: 1;
    visibility: visible;
  }

  .ui-tooltip--top & {
    bottom: calc(100% + 5px);
    left: 50%;
    transform: translateX(-50%);
  }
  .ui-tooltip--bottom & {
    top: calc(100% + 5px);
    left: 50%;
    transform: translateX(-50%);
  }
}
.ui-tooltip__content {
  background-color: rgba(11, 11, 11, 0.98);
  color: #fff;
  padding: 8px;
  border-radius: 8px;
  font-size: 12px;
  max-width: 200px;
  width: max-content;
  text-align: center;
}
</style>
