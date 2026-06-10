<template>
  <div class="min-w-0">
    <div class="text-muted-foreground text-[10px] font-semibold tracking-[0.16em] uppercase">
      {{ label }}
    </div>
    <div class="mt-1 truncate text-lg font-semibold tracking-tight tabular-nums">{{ value }}</div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
  value: string;
}>();
</script>
