<template>
  <Card class="max-w-4xl">
    <CardHeader class="border-b">
      <h2 class="mb-2 text-2xl font-semibold">{{ $t('settings.appearance.title') }}</h2>
      <p class="text-sm opacity-80">{{ $t('settings.appearance.description') }}</p>
    </CardHeader>

    <CardContent class="mt-6 flex flex-col gap-6">
      <!-- Theme Section -->
      <div>
        <h3 class="mb-2 text-lg font-medium">{{ $t('settings.appearance.theme.title') }}</h3>
        <p class="mb-4 text-sm leading-relaxed">
          {{ $t('settings.appearance.theme.description') }}
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

      <!-- Sidebar Sections -->
      <div>
        <h3 class="mb-2 text-lg font-medium">{{ $t('settings.appearance.sidebar.title') }}</h3>
        <p class="mb-4 text-sm leading-relaxed">
          {{ $t('settings.appearance.sidebar.description') }}
        </p>

        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between gap-4">
            <span class="flex items-center gap-2 text-sm">
              <LayersIcon class="text-muted-foreground size-4 shrink-0" />
              {{ $t('sidebar.accountsView.bankAccounts') }}
            </span>
            <ResponsiveTooltip :content="$t('settings.appearance.sidebar.alwaysVisibleTooltip')">
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
              :disabled="isUpdating"
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
              :disabled="isUpdating"
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
              :disabled="isUpdating"
              @update:model-value="(v) => handleSidebarToggle('vehicles', !!v)"
            />
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { ThemePreference, setThemePreference, themePreference } from '@/common/utils/color-theme';
import ResponsiveTooltip from '@/components/common/responsive-tooltip.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { Separator } from '@/components/lib/ui/separator';
import { Switch } from '@/components/lib/ui/switch';
import { useUserSettings } from '@/composable/data-queries/user-settings';
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
import { type Component, computed } from 'vue';

const { data: userSettings, mutateAsync, isUpdating } = useUserSettings();

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

const sidebarSections = computed(() => ({
  portfolios: userSettings.value?.sidebarSections?.portfolios ?? true,
  ventures: userSettings.value?.sidebarSections?.ventures ?? true,
  vehicles: userSettings.value?.sidebarSections?.vehicles ?? true,
}));

const handleSidebarToggle = (key: 'portfolios' | 'ventures' | 'vehicles', value: boolean) =>
  mutateAsync({
    ...userSettings.value,
    sidebarSections: { ...sidebarSections.value, [key]: value },
  });
</script>
