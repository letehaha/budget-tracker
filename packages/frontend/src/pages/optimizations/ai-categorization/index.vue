<script setup lang="ts">
import { Button } from '@/components/lib/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/lib/ui/tabs';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { ROUTES_NAMES } from '@/routes';
import { ArrowLeftIcon } from '@lucide/vue';
import { useElementSize } from '@vueuse/core';
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import CategorizeTab from './components/categorize-tab.vue';
import HistoryTab from './components/history-tab.vue';

const TAB = { categorize: 'categorize', history: 'history' } as const;

const route = useRoute();
const router = useRouter();

// The query string is the single source of truth for both the tab and the
// opened run, so a reload lands the user exactly where they were.
const activeTab = computed(() => (route.query.tab === TAB.history ? TAB.history : TAB.categorize));
const openedRunAt = computed(() => {
  if (activeTab.value !== TAB.history) return null;
  return typeof route.query.run === 'string' && route.query.run ? route.query.run : null;
});

const onTabChange = (value: string | number) => {
  const tab = String(value) === TAB.history ? TAB.history : TAB.categorize;
  if (tab === activeTab.value) return;
  router.replace({ query: { ...route.query, tab, run: undefined } });
};

const openRun = ({ categorizedAt }: { categorizedAt: string }) => {
  router.push({ query: { ...route.query, tab: TAB.history, run: categorizedAt } });
};

const closeRun = () => {
  router.replace({ query: { ...route.query, run: undefined } });
};

// An inactive TabsContent stays in the DOM carrying only the `hidden` attribute,
// and `display: flex` would beat it — an empty pane would then steal half the
// column's height from the active one.
const tabContentClass = ({ tab }: { tab: string }) =>
  activeTab.value === tab ? 'mt-3 flex min-h-0 flex-1 flex-col' : undefined;

// Narrow-layout flag comes from the page container: the sidebar eats ~300px, so
// viewport width flips this at the wrong moment.
const MOBILE_MODE_MAX_WIDTH_PX = 672;
const pageRef = ref<HTMLElement | null>(null);
const { width: pageWidth } = useElementSize(pageRef);
const isMobileMode = computed(() => pageWidth.value > 0 && pageWidth.value < MOBILE_MODE_MAX_WIDTH_PX);
</script>

<template>
  <!-- Bounded height + internal scrolling keeps the table's virtualizer working:
       in an unbounded container every virtual row stays mounted and the
       infinite-scroll sentinel keeps firing until the last page. -->
  <div
    ref="pageRef"
    class="flex h-[calc(100dvh-var(--header-height))] min-h-0 flex-col gap-3 overflow-hidden p-4 max-md:h-[calc(100dvh-var(--header-height)-var(--bottom-navbar-height))] md:p-6"
  >
    <div class="flex h-8 shrink-0 items-center gap-2">
      <DesktopOnlyTooltip :content="$t('optimizations.backToOptimizations')">
        <Button variant="ghost" size="icon-sm" class="text-muted-foreground -ml-1 shrink-0" as-child>
          <RouterLink :to="{ name: ROUTES_NAMES.optimizations }" :aria-label="$t('optimizations.backToOptimizations')">
            <ArrowLeftIcon class="size-4" />
          </RouterLink>
        </Button>
      </DesktopOnlyTooltip>

      <h1 class="truncate text-xl font-bold tracking-tight">
        {{ $t('optimizations.aiCategorization.title') }}
      </h1>
    </div>

    <Tabs :model-value="activeTab" class="flex min-h-0 flex-1 flex-col" @update:model-value="onTabChange">
      <TabsList variant="underline" class="shrink-0">
        <TabsTrigger :value="TAB.categorize">{{ $t('optimizations.aiCategorization.tabs.categorize') }}</TabsTrigger>
        <TabsTrigger :value="TAB.history">{{ $t('optimizations.aiCategorization.tabs.history') }}</TabsTrigger>
      </TabsList>

      <TabsContent :value="TAB.categorize" :class="tabContentClass({ tab: TAB.categorize })">
        <CategorizeTab :is-mobile-mode="isMobileMode" />
      </TabsContent>

      <TabsContent :value="TAB.history" :class="tabContentClass({ tab: TAB.history })">
        <HistoryTab :is-mobile-mode="isMobileMode" :opened-run-at="openedRunAt" @open-run="openRun" @back="closeRun" />
      </TabsContent>
    </Tabs>
  </div>
</template>
