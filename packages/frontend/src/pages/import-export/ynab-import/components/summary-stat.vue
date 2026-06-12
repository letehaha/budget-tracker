<template>
  <div class="bg-muted/40 rounded-md border p-3">
    <div class="text-muted-foreground text-xs">{{ label }}</div>
    <div class="mt-1 text-xl font-semibold">{{ value }}</div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
  value: number;
}>();
</script>
