<template>
  <Icon v-if="name" :icon="`lucide:${name}`" :class="props.class" />
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue';

const props = defineProps<{
  name: string | null | undefined;
  class?: string;
}>();
</script>
