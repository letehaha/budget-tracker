<template>
  <p v-if="errorMessage" class="text-destructive ml-2 mt-1 text-sm">
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
