<template>
  <UiButton variant="link" size="sm" class="mt-2 h-auto px-0" @click="emit('click')">
    <HelpCircleIcon class="size-4" />
    {{ label }}
  </UiButton>
</template>

<script lang="ts" setup>
import UiButton from '@/components/lib/ui/button/Button.vue';
import { HelpCircleIcon } from '@lucide/vue';

defineProps<{
  label: string;
}>();

const emit = defineEmits<{
  click: [];
}>();
</script>
