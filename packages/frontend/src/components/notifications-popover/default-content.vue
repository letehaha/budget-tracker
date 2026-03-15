<script setup lang="ts">
defineProps<{
  message: string | null;
}>();
</script>

<template>
  <p v-if="message" class="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
    {{ message }}
  </p>
</template>
