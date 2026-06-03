<template>
  <Card class="max-w-4xl">
    <CardHeader class="border-b">
      <h2 class="mb-2 text-2xl font-semibold">{{ $t('settings.preferences.title') }}</h2>
      <p class="text-sm opacity-80">{{ $t('settings.preferences.description') }}</p>
    </CardHeader>

    <CardContent class="mt-6 flex flex-col gap-6">
      <!-- Theme Section -->
      <div>
        <h3 class="mb-2 text-lg font-medium">{{ $t('settings.preferences.theme.title') }}</h3>
        <p class="mb-4 text-sm leading-relaxed">
          {{ $t('settings.preferences.theme.description') }}
        </p>

        <div class="flex flex-wrap gap-2">
          <Button
            v-for="option in themeOptions"
            :key="option.value"
            :variant="themePreference === option.value ? 'default' : 'outline'"
            size="sm"
            @click="setThemePreference(option.value)"
          >
            <component :is="option.icon" class="size-4" />
            <span>{{ $t(option.labelKey) }}</span>
          </Button>
        </div>
      </div>

      <Separator />

      <!-- Language Section -->
      <div>
        <h3 class="mb-2 text-lg font-medium">{{ $t('settings.preferences.language.title') }}</h3>
        <p class="mb-4 text-sm leading-relaxed">
          {{ $t('settings.preferences.language.description') }}
        </p>

        <div class="flex flex-wrap gap-2">
          <Button
            v-for="locale in availableLocales"
            :key="locale.value"
            :variant="currentLocale === locale.value ? 'default' : 'outline'"
            size="sm"
            @click="handleLocaleChange(locale.value)"
          >
            <img :src="locale.flagSrc" :alt="locale.native" class="h-4 w-5.5 rounded-sm object-cover" />
            <span>{{ locale.native }}</span>
          </Button>
        </div>
      </div>

      <Separator />

      <!-- Sidebar Sections -->
      <div>
        <h3 class="mb-2 text-lg font-medium">{{ $t('settings.preferences.sidebar.title') }}</h3>
        <p class="mb-4 text-sm leading-relaxed">
          {{ $t('settings.preferences.sidebar.description') }}
        </p>

        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between gap-4">
            <span class="flex items-center gap-2 text-sm">
              <LayersIcon class="text-muted-foreground size-4 shrink-0" />
              {{ $t('sidebar.accountsView.bankAccounts') }}
            </span>
            <ResponsiveTooltip :content="$t('settings.preferences.sidebar.alwaysVisibleTooltip')">
              <span class="text-muted-foreground flex cursor-help items-center gap-2">
                <InfoIcon class="size-4" />
                <Switch :model-value="true" disabled />
              </span>
            </ResponsiveTooltip>
          </div>

          <div class="flex items-center justify-between gap-4">
            <span class="flex items-center gap-2 text-sm">
              <TrendingUpIcon class="text-muted-foreground size-4 shrink-0" />
              {{ $t('sidebar.accountsView.portfolios') }}
            </span>
            <Switch
              :model-value="sidebarSections.portfolios"
              :disabled="isUpdatingSidebar"
              @update:model-value="(v) => handleSidebarToggle('portfolios', !!v)"
            />
          </div>

          <div class="flex items-center justify-between gap-4">
            <span class="flex items-center gap-2 text-sm">
              <RocketIcon class="text-muted-foreground size-4 shrink-0" />
              {{ $t('sidebar.accountsView.ventures') }}
            </span>
            <Switch
              :model-value="sidebarSections.ventures"
              :disabled="isUpdatingSidebar"
              @update:model-value="(v) => handleSidebarToggle('ventures', !!v)"
            />
          </div>

          <div class="flex items-center justify-between gap-4">
            <span class="flex items-center gap-2 text-sm">
              <CarIcon class="text-muted-foreground size-4 shrink-0" />
              {{ $t('sidebar.accountsView.cars') }}
            </span>
            <Switch
              :model-value="sidebarSections.vehicles"
              :disabled="isUpdatingSidebar"
              @update:model-value="(v) => handleSidebarToggle('vehicles', !!v)"
            />
          </div>
        </div>
      </div>

      <Separator />

      <!-- Balance & Statistics Section -->
      <div>
        <h3 class="mb-2 text-lg font-medium">
          {{ $t('settings.preferences.balanceStats.title') }}
        </h3>
        <p class="mb-4 text-sm leading-relaxed">
          {{ $t('settings.preferences.balanceStats.description') }}
        </p>

        <div class="flex items-center justify-between gap-4">
          <div class="flex-1">
            <div class="text-sm font-medium">
              {{ $t('settings.preferences.balanceStats.creditLimit.label') }}
            </div>
            <p class="text-muted-foreground mt-1 text-xs leading-relaxed">
              {{ $t('settings.preferences.balanceStats.creditLimit.description') }}
            </p>
          </div>
          <Switch
            :model-value="includeCreditLimitInStats"
            :disabled="isUpdatingCreditLimitSetting"
            @update:model-value="handleCreditLimitToggle"
          />
        </div>
      </div>

      <Separator />

      <!-- Quick Start Section -->
      <div>
        <h3 class="mb-2 text-lg font-medium">{{ $t('settings.preferences.quickStart.title') }}</h3>
        <p class="mb-4 text-sm leading-relaxed">
          {{ $t('settings.preferences.quickStart.description') }}
        </p>

        <div class="flex items-center gap-3">
          <Button variant="outline" :disabled="isReopening || !isDismissed" @click="handleReopenQuickStart">
            <RocketIcon class="mr-2 size-4" />
            {{ $t('settings.preferences.quickStart.button') }}
          </Button>

          <span v-if="!isDismissed" class="text-success-text text-sm">
            {{ $t('settings.preferences.quickStart.activeLabel') }}
          </span>
        </div>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { api } from '@/api';
import { ThemePreference, setThemePreference, themePreference } from '@/common/utils/color-theme';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import ResponsiveTooltip from '@/components/common/responsive-tooltip.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { Separator } from '@/components/lib/ui/separator';
import { Switch } from '@/components/lib/ui/switch';
import { useNotificationCenter } from '@/components/notification-center';
import { useUserSettings } from '@/composable/data-queries/user-settings';
import { getCurrentLocale, setLocale } from '@/i18n';
import { trackAnalyticsEvent } from '@/lib/posthog';
import { useOnboardingStore } from '@/stores/onboarding';
import { LOCALE_NAMES, SUPPORTED_LOCALES, type SupportedLocale } from '@bt/shared/i18n/locales';
import { useQueryClient } from '@tanstack/vue-query';
import {
  CarIcon,
  InfoIcon,
  LayersIcon,
  MonitorIcon,
  MoonStarIcon,
  RocketIcon,
  SunIcon,
  TrendingUpIcon,
} from '@lucide/vue';
import { storeToRefs } from 'pinia';
import { type Component, computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const queryClient = useQueryClient();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const onboardingStore = useOnboardingStore();
const { isDismissed } = storeToRefs(onboardingStore);

const { data: userSettings, mutateAsync } = useUserSettings();

interface ThemeOption {
  value: ThemePreference;
  labelKey: string;
  icon: Component;
}

const themeOptions: ThemeOption[] = [
  { value: ThemePreference.light, labelKey: 'themeSelector.light', icon: SunIcon },
  { value: ThemePreference.dark, labelKey: 'themeSelector.dark', icon: MoonStarIcon },
  { value: ThemePreference.system, labelKey: 'themeSelector.system', icon: MonitorIcon },
];

const FLAG_SRCS: Record<SupportedLocale, string> = {
  [SUPPORTED_LOCALES.ENGLISH]: '/img/flags/gb.svg',
  [SUPPORTED_LOCALES.UKRAINIAN]: '/img/flags/ua.svg',
};

const currentLocale = ref<SupportedLocale>(getCurrentLocale() as SupportedLocale);

const availableLocales = [
  {
    value: SUPPORTED_LOCALES.ENGLISH,
    native: LOCALE_NAMES[SUPPORTED_LOCALES.ENGLISH].native,
    flagSrc: FLAG_SRCS[SUPPORTED_LOCALES.ENGLISH],
  },
  {
    value: SUPPORTED_LOCALES.UKRAINIAN,
    native: LOCALE_NAMES[SUPPORTED_LOCALES.UKRAINIAN].native,
    flagSrc: FLAG_SRCS[SUPPORTED_LOCALES.UKRAINIAN],
  },
];

const handleLocaleChange = async (locale: SupportedLocale) => {
  const previousLocale = currentLocale.value;
  if (previousLocale === locale) return;

  currentLocale.value = locale;
  await setLocale(locale);

  trackAnalyticsEvent({
    event: 'language_changed',
    properties: { from_locale: previousLocale, to_locale: locale },
  });

  try {
    const currentSettings = await api.get('/user/settings');
    await api.put('/user/settings', { ...currentSettings, locale });
    queryClient.invalidateQueries({ queryKey: ['user', 'settings'] });
  } catch {
    // localStorage is already updated by setLocale; backend persistence is best-effort
    console.error('Failed to persist locale to backend');
  }
};

const sidebarSections = computed(() => ({
  portfolios: userSettings.value?.sidebarSections?.portfolios ?? true,
  ventures: userSettings.value?.sidebarSections?.ventures ?? true,
  vehicles: userSettings.value?.sidebarSections?.vehicles ?? true,
}));
const isUpdatingSidebar = ref(false);

const handleSidebarToggle = async (key: 'portfolios' | 'ventures' | 'vehicles', value: boolean) => {
  isUpdatingSidebar.value = true;
  try {
    await mutateAsync({
      ...userSettings.value,
      sidebarSections: { ...sidebarSections.value, [key]: value },
    });
  } finally {
    isUpdatingSidebar.value = false;
  }
};

const includeCreditLimitInStats = computed(() => userSettings.value?.includeCreditLimitInStats ?? false);
const isUpdatingCreditLimitSetting = ref(false);

const handleCreditLimitToggle = async (value: boolean) => {
  isUpdatingCreditLimitSetting.value = true;
  try {
    await mutateAsync({
      ...userSettings.value,
      includeCreditLimitInStats: value,
    });

    addSuccessNotification(t('settings.preferences.balanceStats.creditLimit.successNotification'));

    // Invalidate all balance-related queries so they refetch with the new setting
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.widgetBalanceTrend] }),
      queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.widgetBalanceTrendPrev] }),
      queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.widgetBalanceTotalBalance] }),
      queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.widgetBalancePreviousBalance] }),
      queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.analyticsBalanceHistoryTrend] }),
    ]);
  } catch {
    addErrorNotification(t('settings.preferences.balanceStats.creditLimit.errorNotification'));
  } finally {
    isUpdatingCreditLimitSetting.value = false;
  }
};

const isReopening = ref(false);

const handleReopenQuickStart = async () => {
  isReopening.value = true;
  try {
    await onboardingStore.reopen();
    onboardingStore.openPanel();
  } finally {
    isReopening.value = false;
  }
};
</script>
