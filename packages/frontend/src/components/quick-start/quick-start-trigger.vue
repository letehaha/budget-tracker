<script lang="ts" setup>
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/lib/ui/tooltip';
import { cn } from '@/lib/utils';
import { useOnboardingStore } from '@/stores/onboarding';
import { RocketIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const onboardingStore = useOnboardingStore();
const { progressPercentage, remainingCount, shouldShowTrigger } = storeToRefs(onboardingStore);

const handleClick = () => {
  onboardingStore.openPanel();
};

// Calculate stroke-dasharray for the circular progress
const circumference = 2 * Math.PI * 15.9155;
const strokeDasharray = (progress: number) => {
  const filled = (progress / 100) * circumference;
  return `${filled} ${circumference}`;
};
</script>

<template>
  <TooltipProvider v-if="shouldShowTrigger">
    <Tooltip>
      <TooltipTrigger as-child>
        <button
          type="button"
          :class="
            cn(
              'fixed z-40 flex items-center justify-center',
              'bg-background rounded-full border shadow-lg',
              'transition-all duration-200 hover:scale-105',
              'focus:ring-primary focus:ring-2 focus:ring-offset-2 focus:outline-none',
              // Desktop: right side, vertically centered
              'top-1/2 right-4 -translate-y-1/2',
              // Mobile: bottom right, above bottom navbar
              'max-md:top-auto max-md:bottom-20 max-md:translate-y-0',
            )
          "
          @click="handleClick"
        >
          <!-- Circular progress indicator -->
          <div class="relative size-12">
            <svg class="size-12 -rotate-90" viewBox="0 0 36 36">
              <!-- Background circle -->
              <circle class="stroke-muted" stroke-width="3" fill="none" cx="18" cy="18" r="15.9155" />
              <!-- Progress circle -->
              <circle
                class="stroke-primary transition-all duration-500 ease-out"
                stroke-width="3"
                stroke-linecap="round"
                fill="none"
                cx="18"
                cy="18"
                r="15.9155"
                :stroke-dasharray="strokeDasharray(progressPercentage)"
              />
            </svg>
            <!-- Center icon -->
            <div class="absolute inset-0 flex items-center justify-center">
              <RocketIcon class="text-primary size-5" />
            </div>
          </div>

          <!-- Badge with remaining count -->
          <span
            v-if="remainingCount > 0"
            class="bg-primary text-primary-foreground absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full text-xs font-medium"
          >
            {{ remainingCount }}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">
        <p>{{ t('dashboard.onboarding.quickStart.ui.triggerTooltip', { count: remainingCount }) }}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
