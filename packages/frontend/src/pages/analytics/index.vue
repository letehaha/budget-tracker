<template>
  <div
    ref="containerRef"
    :class="
      cn(
        'flex min-h-[calc(100dvh-var(--header-height)-var(--bottom-navbar-height))] flex-col p-4 sm:flex-row',
        isTransitionReady && 'transition-all duration-200',
        isCollapsed && !isCompactLayout ? 'md:pr-6 md:pl-2' : 'md:px-6',
        isMobileView
          ? 'min-h-[calc(100dvh-var(--header-height)-var(--bottom-navbar-height))]'
          : 'min-h-[calc(100dvh-var(--header-height))]',
        (isOnChildRoute || !isCompactLayout) && 'pt-4',
        isCollapsed && !isCompactLayout ? 'gap-2' : 'gap-6',
      )
    "
  >
    <!-- Sidebar Navigation (wide: always visible, compact: only on root) -->
    <nav
      v-if="!isOnChildRoute || !isCompactLayout"
      :class="[
        'border-border bg-card/50 shrink-0 rounded-lg border p-2 backdrop-blur-sm',
        isTransitionReady && 'transition-all duration-200',
        isCompactLayout ? 'w-full' : isCollapsed ? 'w-14' : 'w-full lg:w-52',
      ]"
    >
      <ul class="sticky top-(--header-height) flex flex-col gap-1 overflow-hidden">
        <!-- Collapse toggle (only on wide layout) -->
        <li v-if="!isCompactLayout" class="border-border mb-1 border-b pb-1">
          <button
            :class="
              cn(
                'text-muted-foreground flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                'hover:bg-accent hover:text-foreground',
              )
            "
            @click="isCollapsed = !isCollapsed"
          >
            <PanelLeftCloseIcon v-if="!isCollapsed" class="size-4 shrink-0" />
            <PanelLeftOpenIcon v-else class="size-4 shrink-0" />
            <span
              :class="['whitespace-nowrap transition-opacity duration-200', isCollapsed ? 'opacity-0' : 'opacity-100']"
            >
              {{ $t('analytics.navigation.collapse') }}
            </span>
          </button>
        </li>

        <li v-for="tab in tabs" :key="tab.name">
          <DesktopOnlyTooltip :content="tab.label" :disabled="!isCollapsed || isCompactLayout" side="right">
            <router-link
              :to="tab.to"
              :class="
                cn(
                  'text-muted-foreground flex items-center gap-2 rounded-md px-3 py-2 whitespace-nowrap transition-colors',
                  'hover:bg-accent hover:text-foreground',
                  '[&.router-link-exact-active]:bg-accent [&.router-link-exact-active]:text-foreground',
                  isCompactLayout ? 'text-sm md:gap-4 md:text-base' : 'text-sm',
                )
              "
            >
              <component :is="tab.icon" :class="cn('size-4 shrink-0', isCompactLayout && 'md:size-5')" />
              <span
                :class="[
                  'transition-opacity duration-200',
                  isCollapsed && !isCompactLayout ? 'opacity-0' : 'opacity-100',
                ]"
              >
                {{ tab.label }}
              </span>
              <ChevronRightIcon v-if="isCompactLayout" class="text-muted-foreground ml-auto size-4" />
            </router-link>
          </DesktopOnlyTooltip>
        </li>
      </ul>
    </nav>

    <!-- Content Area (wide: always visible, compact: only on child routes) -->
    <div v-if="isOnChildRoute || !isCompactLayout" class="min-w-0 flex-1">
      <!-- Back button (compact layout only) -->
      <BackLink v-if="isCompactLayout" :to="{ name: ROUTES_NAMES.analytics }">
        {{ $t('analytics.backToAnalytics') }}
      </BackLink>

      <router-view />
    </div>
  </div>
</template>

<script setup lang="ts">
import BackLink from '@/components/common/back-link.vue';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { useAfterMountTransition } from '@/composable/use-after-mount-transition';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { cn } from '@/lib/utils';
import { ROUTES_NAMES } from '@/routes';
import { useElementSize, useLocalStorage } from '@vueuse/core';
import {
  CalculatorIcon,
  ChevronRightIcon,
  DollarSignIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  TrendingUpIcon,
} from 'lucide-vue-next';
import { type Component, computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouteLocationRaw, useRoute, useRouter } from 'vue-router';

interface Tab {
  name: string;
  label: string;
  to: RouteLocationRaw;
  icon: Component;
}

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const containerRef = ref<HTMLElement | null>(null);
const { width: containerWidth } = useElementSize(containerRef);

const isMobileView = useWindowBreakpoints(CUSTOM_BREAKPOINTS.uiMobile, {
  wait: 50,
});

const isCompactLayout = computed(() => containerWidth.value < 920);
const isCollapsed = useLocalStorage('analytics-sidebar-collapsed', false);

const isTransitionReady = useAfterMountTransition();

const isOnChildRoute = computed(() => route.name !== ROUTES_NAMES.analytics);

// On wide layout, redirect to cash-flow if on root analytics
watch(
  [isCompactLayout, () => route.name],
  ([compact, routeName]) => {
    if (!compact && routeName === ROUTES_NAMES.analytics) {
      router.replace({ name: ROUTES_NAMES.analyticsTrendsComparison });
    }
  },
  { immediate: true },
);

const tabs = computed<Tab[]>(() => [
  {
    name: 'trends-comparison',
    label: t('analytics.navigation.trendsComparison'),
    to: { name: ROUTES_NAMES.analyticsTrendsComparison },
    icon: TrendingUpIcon,
  },
  {
    name: 'cash-flow',
    label: t('analytics.navigation.cashFlow'),
    to: { name: ROUTES_NAMES.analyticsCashFlow },
    icon: DollarSignIcon,
  },
  {
    name: 'investment-calculator',
    label: t('analytics.navigation.investmentCalculator'),
    to: { name: ROUTES_NAMES.analyticsInvestmentCalculator },
    icon: CalculatorIcon,
  },
]);
</script>
