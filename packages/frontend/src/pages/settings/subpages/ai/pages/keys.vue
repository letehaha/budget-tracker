<template>
  <div class="flex flex-col gap-6">
    <ApiKeyManager />
  </div>
</template>

<script setup lang="ts">
import ApiKeyManager from '../components/api-key-manager.vue';

defineOptions({
  name: 'settings-ai-keys',
});
</script>
