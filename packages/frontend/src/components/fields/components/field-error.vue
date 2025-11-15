<template>
  <p v-if="errorMessage" class="text-destructive-text mt-1 ml-2 text-sm">
    {{ errorMessage }}
  </p>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  props: {
    errorMessage: { type: String, default: undefined },
  },
});
</script>
