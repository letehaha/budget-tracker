<script lang="ts" setup>
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/lib/ui/drawer';
import { ScrollArea, ScrollBar } from '@/components/lib/ui/scroll-area';
import { SCROLL_AREA_IDS } from '@/components/lib/ui/scroll-area/types';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/lib/ui/sheet';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import type { OnboardingTask } from '@/stores/onboarding';
import { useOnboardingStore } from '@/stores/onboarding';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

const { t } = useI18n();

import QuickStartCategory from './quick-start-category.vue';
import QuickStartFooter from './quick-start-footer.vue';
import QuickStartHeader from './quick-start-header.vue';

const router = useRouter();
const onboardingStore = useOnboardingStore();

const {
  isPanelOpen,
  categories,
  progressPercentage,
  completedCount,
  totalTasks,
} = storeToRefs(onboardingStore);

const isMobile = useWindowBreakpoints(CUSTOM_BREAKPOINTS.uiMobile, { wait: 50 });

const handleClose = () => {
  onboardingStore.closePanel();
};

const handleDismiss = () => {
  onboardingStore.dismissPermanently();
};

const handleToggleCategory = (categoryId: string) => {
  onboardingStore.toggleCategory(categoryId);
};

const handleTaskClick = (task: OnboardingTask) => {
  // Close panel before navigating
  onboardingStore.closePanel();

  // Navigate to the task's route if available
  if (task.route) {
    router.push({ name: task.route });
  }
};

const handleOpenChange = (open: boolean) => {
  if (open) {
    onboardingStore.openPanel();
  } else {
    onboardingStore.closePanel();
  }
};
</script>

<template>
  <!-- Desktop: Sheet -->
  <Sheet v-if="!isMobile" :open="isPanelOpen" @update:open="handleOpenChange">
    <SheetContent side="right" class="flex w-80 flex-col p-0 sm:max-w-80">
      <SheetTitle class="sr-only">{{ t('dashboard.onboarding.quickStart.ui.title') }}</SheetTitle>
      <SheetDescription class="sr-only">{{ t('dashboard.onboarding.quickStart.ui.srDescription') }}</SheetDescription>

      <QuickStartHeader
        :progress="progressPercentage"
        :completed-count="completedCount"
        :total-count="totalTasks"
        @close="handleClose"
      />

      <ScrollArea class="flex-1" :scroll-area-id="SCROLL_AREA_IDS.quickStart">
        <div class="space-y-0.5 px-3 py-2">
          <QuickStartCategory
            v-for="category in categories"
            :key="category.id"
            :category="category"
            :is-expanded="onboardingStore.isCategoryExpanded(category.id)"
            :completed-count="onboardingStore.getCategoryProgress(category.id).completed"
            :is-task-completed="onboardingStore.isTaskCompleted"
            @toggle="handleToggleCategory(category.id)"
            @task-click="handleTaskClick"
          />
        </div>
        <ScrollBar />
      </ScrollArea>

      <QuickStartFooter @dismiss="handleDismiss" />
    </SheetContent>
  </Sheet>

  <!-- Mobile: Drawer -->
  <Drawer v-else :open="isPanelOpen" @update:open="handleOpenChange">
    <DrawerContent class="max-h-[85vh]">
      <DrawerTitle class="sr-only">{{ t('dashboard.onboarding.quickStart.ui.title') }}</DrawerTitle>
      <DrawerDescription class="sr-only">{{ t('dashboard.onboarding.quickStart.ui.srDescription') }}</DrawerDescription>

      <QuickStartHeader
        :progress="progressPercentage"
        :completed-count="completedCount"
        :total-count="totalTasks"
        @close="handleClose"
      />

      <ScrollArea class="flex-1 overflow-auto" :scroll-area-id="SCROLL_AREA_IDS.quickStart">
        <div class="space-y-0.5 px-3 py-2">
          <QuickStartCategory
            v-for="category in categories"
            :key="category.id"
            :category="category"
            :is-expanded="onboardingStore.isCategoryExpanded(category.id)"
            :completed-count="onboardingStore.getCategoryProgress(category.id).completed"
            :is-task-completed="onboardingStore.isTaskCompleted"
            @toggle="handleToggleCategory(category.id)"
            @task-click="handleTaskClick"
          />
        </div>
        <ScrollBar />
      </ScrollArea>

      <QuickStartFooter @dismiss="handleDismiss" />
    </DrawerContent>
  </Drawer>
</template>
