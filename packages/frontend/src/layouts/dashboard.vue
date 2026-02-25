<template>
  <div class="bg-background flex h-screen max-md:flex-col">
    <template v-if="!isMobileView">
      <Sidebar />
    </template>

    <ScrollArea ref="scrollAreaRef" class="flex-1" :scroll-area-id="SCROLL_AREA_IDS.dashboard">
      <ui-header class="bg-background sticky top-0 z-10" />

      <template v-if="isAppInitialized">
        <router-view />
      </template>

      <ScrollBar />
    </ScrollArea>

    <template v-if="isMobileView">
      <BottomNavbar />
    </template>

    <!-- Quick Start Onboarding Sidebar (desktop only) -->
    <template v-if="!isMobileView">
      <QuickStartSidebar />
    </template>

    <!-- Quick Start Onboarding (mobile: floating trigger + drawer) -->
    <template v-if="isMobileView">
      <QuickStartTrigger />
      <QuickStartPanel />
    </template>
  </div>
</template>

<script lang="ts" setup>
import BottomNavbar from '@/components/bottom-navbar.vue';
import { ScrollArea, ScrollBar } from '@/components/lib/ui/scroll-area';
import { SCROLL_AREA_IDS } from '@/components/lib/ui/scroll-area/types';
import { QuickStartPanel, QuickStartSidebar, QuickStartTrigger } from '@/components/quick-start';
import Sidebar from '@/components/sidebar/index.vue';
import UiHeader from '@/components/ui-header.vue';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { ROUTES_NAMES } from '@/routes/constants';
import { useCurrenciesStore, useOnboardingStore, useRootStore } from '@/stores';
import { storeToRefs } from 'pinia';
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const router = useRouter();
const route = useRoute();
const rootStore = useRootStore();
const userCurrenciesStore = useCurrenciesStore();
const onboardingStore = useOnboardingStore();
const isMobileView = useWindowBreakpoints(CUSTOM_BREAKPOINTS.uiMobile, {
  wait: 50,
});

const scrollAreaRef = ref<InstanceType<typeof ScrollArea> | null>(null);

watch(
  () => route.fullPath,
  () => {
    if (scrollAreaRef.value?.viewportRef?.viewportElement) {
      scrollAreaRef.value.viewportRef.viewportElement.scrollTop = 0;
    }
  },
);

const { isAppInitialized } = storeToRefs(rootStore);
const { isBaseCurrencyExists } = storeToRefs(userCurrenciesStore);

watch(
  isAppInitialized,
  (value) => {
    if (value && !isBaseCurrencyExists.value) {
      router.push({ name: ROUTES_NAMES.welcome });
    }

    // Fetch onboarding state when app is initialized
    if (value) {
      onboardingStore.fetchOnboardingState();
    }
  },
  { immediate: true },
);

// Watch route changes to auto-complete page-visit tasks
watch(
  () => route.name,
  (routeName) => {
    if (!onboardingStore.isInitialized) return;

    if (routeName === ROUTES_NAMES.analyticsCashFlow) {
      onboardingStore.completeTask('view-cash-flow');
    }
    if (routeName === ROUTES_NAMES.analytics || routeName === ROUTES_NAMES.analyticsTrendsComparison) {
      onboardingStore.completeTask('view-annual-overview');
    }
    if (routeName === ROUTES_NAMES.settingsAiFeatures) {
      onboardingStore.completeTask('review-ai-features');
    }
  },
);
</script>
