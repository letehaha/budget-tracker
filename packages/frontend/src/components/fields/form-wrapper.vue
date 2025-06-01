<template>
  <div class="form-wrapper">
    <template v-if="Array.isArray(error)">
      <div class="grid gap-2">
        <template v-for="item in error" :key="item">
          <p class="text-destructive-foreground overflow-hidden text-center text-sm">
            {{ item }}
          </p>
        </template>
      </div>
    </template>
    <template v-else-if="error">
      <div class="grid gap-2">
        <p class="text-destructive-foreground overflow-hidden text-center text-sm">
          {{ error }}
        </p>
      </div>
    </template>

    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  error?: string[] | string | null;
}>();
</script>
