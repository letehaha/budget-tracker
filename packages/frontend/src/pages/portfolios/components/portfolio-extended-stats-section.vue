<template>
  <div>
    <h3 class="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
      {{ title }}
    </h3>
    <div class="grid grid-cols-2 gap-4 @md/balance:grid-cols-3 @3xl/balance:grid-cols-4">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ title: string }>();
</script>
