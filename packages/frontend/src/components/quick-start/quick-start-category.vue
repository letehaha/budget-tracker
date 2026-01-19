<script lang="ts" setup>
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/lib/ui/collapsible';
import { cn } from '@/lib/utils';
import type { OnboardingCategory, OnboardingTask } from '@/stores/onboarding';
import {
  BarChart3Icon,
  CheckCircle2Icon,
  ChevronDownIcon,
  FolderIcon,
  Link2Icon,
  RocketIcon,
  SparklesIcon,
} from 'lucide-vue-next';
import { computed } from 'vue';

import QuickStartTask from './quick-start-task.vue';

const props = defineProps<{
  category: OnboardingCategory;
  isExpanded: boolean;
  completedCount: number;
  isTaskCompleted: (taskId: string) => boolean;
}>();

const emit = defineEmits<{
  toggle: [];
  taskClick: [task: OnboardingTask];
}>();

const isComplete = computed(() => props.completedCount === props.category.tasks.length);

const iconComponent = computed(() => {
  const icons: Record<string, typeof RocketIcon> = {
    rocket: RocketIcon,
    folder: FolderIcon,
    link: Link2Icon,
    chart: BarChart3Icon,
    sparkles: SparklesIcon,
  };
  return icons[props.category.icon] || RocketIcon;
});
</script>

<template>
  <Collapsible :open="isExpanded" @update:open="emit('toggle')">
    <CollapsibleTrigger as-child>
      <button
        type="button"
        :class="
          cn(
            'flex w-full items-center justify-between rounded-lg p-3 text-left transition-colors',
            'hover:bg-muted',
            isComplete && 'opacity-60',
          )
        "
      >
        <div class="flex items-center gap-3">
          <div
            :class="
              cn(
                'flex size-8 items-center justify-center rounded-lg',
                isComplete ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
              )
            "
          >
            <CheckCircle2Icon v-if="isComplete" class="size-4" />
            <component :is="iconComponent" v-else class="size-4" />
          </div>
          <span :class="cn('text-sm font-medium', isComplete && 'text-muted-foreground')">
            {{ category.title }}
          </span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-muted-foreground text-xs">{{ completedCount }}/{{ category.tasks.length }}</span>
          <ChevronDownIcon
            :class="cn('text-muted-foreground size-4 transition-transform', isExpanded && 'rotate-180')"
          />
        </div>
      </button>
    </CollapsibleTrigger>

    <CollapsibleContent>
      <div class="space-y-1 pb-2 pl-11">
        <QuickStartTask
          v-for="task in category.tasks"
          :key="task.id"
          :task="task"
          :is-completed="isTaskCompleted(task.id)"
          @click="emit('taskClick', task)"
        />
      </div>
    </CollapsibleContent>
  </Collapsible>
</template>
