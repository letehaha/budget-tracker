<template>
  <div class="flex flex-col gap-6">
    <CustomEndpointManager />
  </div>
</template>

<script setup lang="ts">
import CustomEndpointManager from '../components/custom-endpoint-manager.vue';

defineOptions({
  name: 'settings-ai-endpoints',
});
</script>
