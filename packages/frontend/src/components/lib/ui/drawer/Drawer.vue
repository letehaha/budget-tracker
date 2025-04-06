<script lang="ts" setup>
import { useForwardPropsEmits } from 'radix-vue';
import type { DrawerRootEmits, DrawerRootProps } from 'vaul-vue';
import { DrawerRoot } from 'vaul-vue';

const props = withDefaults(defineProps<DrawerRootProps>(), {
  shouldScaleBackground: true,
});

const emits = defineEmits<DrawerRootEmits>();

const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <DrawerRoot v-bind="forwarded" @open-auto-focus="(e) => console.log(e)">
    <slot />
  </DrawerRoot>
</template>
