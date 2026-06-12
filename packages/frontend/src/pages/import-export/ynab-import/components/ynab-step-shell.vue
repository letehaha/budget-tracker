<template>
  <div class="bg-card rounded-lg border">
    <div class="flex w-full items-center justify-between p-4 text-left">
      <div class="flex items-center gap-3">
        <div
          class="flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold"
          :class="{
            'border-primary bg-primary text-primary-foreground': isCurrent,
            'border-primary bg-primary/10 text-primary': isCompleted,
            'border-muted-foreground/30 text-muted-foreground': !isAccessible,
          }"
        >
          <CheckIcon v-if="isCompleted" class="size-4" />
          <span v-else>{{ stepNumber }}</span>
        </div>
        <div>
          <h3 class="font-semibold">{{ title }}</h3>
          <p class="text-muted-foreground text-sm">{{ description }}</p>
        </div>
      </div>
      <LockIcon v-if="!isAccessible" class="text-muted-foreground size-5" />
    </div>
    <div v-if="isCurrent" class="border-t p-4">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { CheckIcon, LockIcon } from '@lucide/vue';

defineProps<{
  stepNumber: number;
  title: string;
  description: string;
  isCurrent: boolean;
  isCompleted: boolean;
  isAccessible: boolean;
}>();
</script>
