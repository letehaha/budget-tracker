<template>
  <a :href="href" target="_blank" rel="noopener noreferrer" class="text-primary underline hover:no-underline">
    {{ text || href }}
  </a>
</template>

<script lang="ts" setup>
defineProps<{ href: string; text?: string }>();
</script>
