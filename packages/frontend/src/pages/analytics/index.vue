<template>
  <div
    ref="containerRef"
    :class="
      cn(
        'flex min-h-[calc(100dvh-var(--header-height)-var(--bottom-navbar-height))] flex-col gap-6 p-4 sm:flex-row md:px-6',
        isMobileView
          ? 'min-h-[calc(100dvh-var(--header-height)-var(--bottom-navbar-height))]'
          : 'min-h-[calc(100dvh-var(--header-height))]',
        (isOnChildRoute || !isCompactLayout) && 'pt-4',
      )
    "
  >
    <!-- Sidebar Navigation (wide: always visible, compact: only on root) -->
    <nav
      v-if="!isOnChildRoute || !isCompactLayout"
      :class="[
        'border-border bg-card/50 w-full shrink-0 rounded-lg border p-2 backdrop-blur-sm',
        !isCompactLayout && 'lg:w-52',
      ]"
    >
      <ul class="sticky top-(--header-height) flex flex-col gap-1">
        <li v-for="tab in tabs" :key="tab.name">
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
            {{ tab.label }}
            <ChevronRightIcon v-if="isCompactLayout" class="text-muted-foreground ml-auto size-4" />
          </router-link>
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
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { cn } from '@/lib/utils';
import { ROUTES_NAMES } from '@/routes';
import { useElementSize } from '@vueuse/core';
import { ChevronRightIcon, DollarSignIcon, TrendingUpIcon } from 'lucide-vue-next';
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
]);
</script>
