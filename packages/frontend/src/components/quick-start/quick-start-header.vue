<script lang="ts" setup>
import Button from '@/components/lib/ui/button/Button.vue';
import { XIcon } from 'lucide-vue-next';

defineProps<{
  progress: number;
  completedCount: number;
  totalCount: number;
}>();

const emit = defineEmits<{
  close: [];
}>();
</script>

<template>
  <div class="border-b p-4">
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-lg font-semibold">Quick Start</h2>
      <Button variant="ghost" size="icon" class="size-8" @click="emit('close')">
        <XIcon class="size-4" />
      </Button>
    </div>

    <p class="text-muted-foreground mb-3 text-sm">Complete these steps to get the most out of MoneyMatter.</p>

    <!-- Progress bar -->
    <div class="space-y-1.5">
      <div class="bg-muted h-2 overflow-hidden rounded-full">
        <div class="bg-primary h-full transition-all duration-500 ease-out" :style="{ width: `${progress}%` }" />
      </div>
      <div class="text-muted-foreground flex justify-between text-xs">
        <span>{{ completedCount }} of {{ totalCount }} complete</span>
        <span>{{ progress }}%</span>
      </div>
    </div>
  </div>
</template>
