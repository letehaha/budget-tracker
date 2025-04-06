<template>
  <p v-if="errorMessage" class="field-error">
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

<style lang="scss">
.field-error {
  color: var(--app-error);
  font-size: 14px;
  margin-top: 4px;
  margin-left: 8px;
}
</style>
