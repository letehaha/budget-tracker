<template>
  <div class="border-border bg-card animate-pulse rounded-lg border p-4" :class="containerClass">
    <div :class="innerClass">
      <div class="bg-muted mb-2 h-4 rounded" :class="titleWidth"></div>
      <div class="bg-muted h-8 rounded" :class="valueWidth"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  titleWidth?: string;
  valueWidth?: string;
  containerClass?: string;
  innerClass?: string;
}>();
</script>
