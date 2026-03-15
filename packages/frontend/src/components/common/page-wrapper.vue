<template>
  <div v-bind="{ ...$attrs, class: cn('p-4 md:px-6', $attrs.class as string) }">
    <slot />
  </div>
</template>

<script lang="ts" setup>
import { cn } from '@/lib/utils';

defineOptions({
  inheritAttrs: false,
});
</script>
