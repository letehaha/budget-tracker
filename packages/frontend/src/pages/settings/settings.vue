<template>
  <div ref="containerRef" class="flex min-h-[calc(100dvh-var(--header-height))] flex-col gap-6 p-6 lg:flex-row">
    <!-- Sidebar Navigation (wide: always visible, compact: only on root) -->
    <nav
      v-if="!isOnChildRoute || !isCompactLayout"
      :class="[
        'border-border bg-card/50 w-full shrink-0 rounded-lg border p-2 backdrop-blur-sm',
        !isCompactLayout && 'lg:w-52',
      ]"
    >
      <ul class="flex flex-col gap-1">
        <li v-for="tab in tabs" :key="tab.name">
          <router-link
            :to="tab.to"
            :class="
              cn(
                'text-muted-foreground flex items-center gap-2 rounded-md px-3 py-2 whitespace-nowrap transition-colors',
                'hover:bg-accent hover:text-foreground',
                '[&.router-link-exact-active]:bg-accent [&.router-link-exact-active]:text-foreground',
                isCompactLayout ? 'text-sm md:gap-4 md:text-lg' : 'text-sm',
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
      <router-link
        v-if="isCompactLayout"
        :to="{ name: ROUTES_NAMES.settings }"
        class="text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1 text-sm transition-colors"
      >
        <ChevronLeftIcon class="size-4" />
        Back to Settings
      </router-link>

      <router-view />
    </div>
  </div>
</template>

<script setup lang="ts">
import { cn } from '@/lib/utils';
import { ROUTES_NAMES } from '@/routes';
import { useUserStore } from '@/stores';
import { useElementSize } from '@vueuse/core';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleDollarSignIcon,
  DatabaseIcon,
  LayersIcon,
  ShieldIcon,
  SparklesIcon,
  TagsIcon,
} from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { type Component, computed, ref, watch } from 'vue';
import { RouteLocationRaw, useRoute, useRouter } from 'vue-router';

interface Tab {
  name: string;
  label: string;
  to: RouteLocationRaw;
  icon: Component;
}

const route = useRoute();
const router = useRouter();
const { user } = storeToRefs(useUserStore());

const containerRef = ref<HTMLElement | null>(null);
const { width: containerWidth } = useElementSize(containerRef);

const isCompactLayout = computed(() => containerWidth.value < 920);
const showAdminTab = ref(user.value.isAdmin);

const isOnChildRoute = computed(() => route.name !== ROUTES_NAMES.settings);

// On wide layout, redirect to currencies if on root settings
watch(
  [isCompactLayout, () => route.name],
  ([compact, routeName]) => {
    if (!compact && routeName === ROUTES_NAMES.settings) {
      router.replace({ name: ROUTES_NAMES.settingsCurrencies });
    }
  },
  { immediate: true },
);

const baseTabs: Tab[] = [
  {
    name: 'currencies',
    label: 'Currencies',
    to: { name: ROUTES_NAMES.settingsCurrencies },
    icon: CircleDollarSignIcon,
  },
  {
    name: 'categories',
    label: 'Categories',
    to: { name: ROUTES_NAMES.settingsCategories },
    icon: TagsIcon,
  },
  {
    name: 'accounts',
    label: 'Accounts groups',
    to: { name: ROUTES_NAMES.settingsAccounts },
    icon: LayersIcon,
  },
  {
    name: 'data-management',
    label: 'Data Management',
    to: { name: ROUTES_NAMES.settingsDataManagement },
    icon: DatabaseIcon,
  },
  {
    name: 'ai',
    label: 'AI',
    to: { name: ROUTES_NAMES.settingsAi },
    icon: SparklesIcon,
  },
];

const adminTab: Tab = {
  name: 'admin',
  label: 'Admin',
  to: { name: ROUTES_NAMES.settingsAdmin },
  icon: ShieldIcon,
};

const tabs = computed(() => {
  const allTabs = [...baseTabs];
  if (showAdminTab.value) {
    allTabs.push(adminTab);
  }
  return allTabs;
});
</script>
