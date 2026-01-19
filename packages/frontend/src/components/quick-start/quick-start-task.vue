<script lang="ts" setup>
import { Checkbox } from '@/components/lib/ui/checkbox';
import { cn } from '@/lib/utils';
import type { OnboardingTask } from '@/stores/onboarding';
import { CheckIcon } from 'lucide-vue-next';

const props = defineProps<{
  task: OnboardingTask;
  isCompleted: boolean;
}>();

const emit = defineEmits<{
  click: [task: OnboardingTask];
}>();

const handleClick = () => {
  if (!props.isCompleted) {
    emit('click', props.task);
  }
};
</script>

<template>
  <button
    type="button"
    :class="
      cn(
        'flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors',
        isCompleted ? 'bg-muted/50 cursor-default' : 'hover:bg-muted cursor-pointer',
      )
    "
    :disabled="isCompleted"
    @click="handleClick"
  >
    <div class="mt-0.5 shrink-0">
      <div
        v-if="isCompleted"
        class="bg-primary text-primary-foreground flex size-5 items-center justify-center rounded-full"
      >
        <CheckIcon class="size-3" />
      </div>
      <Checkbox v-else :checked="false" disabled class="size-5 cursor-pointer" />
    </div>
    <div class="min-w-0 flex-1">
      <p :class="cn('text-sm font-medium', isCompleted && 'text-muted-foreground line-through')">
        {{ task.title }}
      </p>
      <p v-if="task.description" class="text-muted-foreground mt-0.5 text-xs">
        {{ task.description }}
      </p>
    </div>
  </button>
</template>
