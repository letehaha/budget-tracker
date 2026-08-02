<template>
  <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
    <span class="text-muted-foreground shrink-0">{{ label }}</span>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
}>();
</script>
