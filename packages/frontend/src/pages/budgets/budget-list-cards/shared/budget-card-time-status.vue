<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  status: 'ended' | 'upcoming' | 'active';
  text: string;
}>();

const statusClass = computed(() => {
  switch (props.status) {
    case 'ended':
      return 'bg-muted text-muted-foreground';
    case 'upcoming':
      return 'bg-blue-500/10 text-blue-400';
    case 'active':
    default:
      return 'bg-success-text/10 text-success-text';
  }
});
</script>

<template>
  <span :class="['rounded-full px-2 py-0.5 text-[10px] font-medium', statusClass]">
    {{ text }}
  </span>
</template>
