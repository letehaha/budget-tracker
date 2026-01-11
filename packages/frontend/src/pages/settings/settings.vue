<template>
  <div
    ref="containerRef"
    :class="
      cn(
        'flex min-h-[calc(100dvh-var(--header-height)-var(--bottom-navbar-height))] flex-col gap-6 p-6 sm:flex-row',
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
      <BackLink v-if="isCompactLayout" :to="{ name: ROUTES_NAMES.settings }">
        {{ $t('settings.backToSettings') }}
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
import { useUserStore } from '@/stores';
import { useElementSize } from '@vueuse/core';
import {
  ChevronRightIcon,
  CircleDollarSignIcon,
  KeyRoundIcon,
  LayersIcon,
  ShieldIcon,
  SparklesIcon,
  TagIcon,
  TagsIcon,
  UploadIcon,
} from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
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
const { user } = storeToRefs(useUserStore());
const { t } = useI18n();

const containerRef = ref<HTMLElement | null>(null);
const { width: containerWidth } = useElementSize(containerRef);

const isMobileView = useWindowBreakpoints(CUSTOM_BREAKPOINTS.uiMobile, {
  wait: 50,
});

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

const baseTabs = computed<Tab[]>(() => [
  {
    name: 'currencies',
    label: t('settings.navigation.currencies'),
    to: { name: ROUTES_NAMES.settingsCurrencies },
    icon: CircleDollarSignIcon,
  },
  {
    name: 'categories',
    label: t('settings.navigation.categories'),
    to: { name: ROUTES_NAMES.settingsCategories },
    icon: TagsIcon,
  },
  {
    name: 'tags',
    label: t('settings.navigation.tags'),
    to: { name: ROUTES_NAMES.settingsTags },
    icon: TagIcon,
  },
  {
    name: 'accounts',
    label: t('settings.navigation.accountsGroups'),
    to: { name: ROUTES_NAMES.settingsAccounts },
    icon: LayersIcon,
  },
  {
    name: 'data-management',
    label: t('settings.navigation.importData'),
    to: { name: ROUTES_NAMES.settingsDataManagement },
    icon: UploadIcon,
  },
  {
    name: 'ai',
    label: t('settings.navigation.ai'),
    to: { name: ROUTES_NAMES.settingsAi },
    icon: SparklesIcon,
  },
  {
    name: 'security',
    label: t('settings.navigation.security'),
    to: { name: ROUTES_NAMES.settingsSecurity },
    icon: KeyRoundIcon,
  },
]);

const adminTab = computed<Tab>(() => ({
  name: 'admin',
  label: t('settings.navigation.admin'),
  to: { name: ROUTES_NAMES.settingsAdmin },
  icon: ShieldIcon,
}));

const tabs = computed(() => {
  const allTabs = [...baseTabs.value];
  if (showAdminTab.value) {
    allTabs.push(adminTab.value);
  }
  return allTabs;
});
</script>
