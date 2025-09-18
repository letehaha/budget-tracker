<template>
  <div class="bg-background sticky right-0 bottom-0 left-0 py-2">
    <nav class="grid grid-cols-5 gap-1">
      <NavigationLinks bottom-nav />
    </nav>
  </div>
</template>

<script setup lang="ts">
import NavigationLinks from './sidebar/navigation-links.vue';
</script>
