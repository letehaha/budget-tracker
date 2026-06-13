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

          <div
            v-for="section in TOGGLEABLE_SIDEBAR_SECTIONS"
            :key="section.key"
            class="flex items-center justify-between gap-4"
          >
            <span class="flex items-center gap-2 text-sm">
              <component :is="section.icon" class="text-muted-foreground size-4 shrink-0" />
              {{ $t(section.labelKey) }}
            </span>
            <Switch
              :model-value="sidebarSections[section.key]"
              :disabled="isUpdating"
              @update:model-value="(v) => toggleSection(section.key, !!v)"
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
import { TOGGLEABLE_SIDEBAR_SECTIONS, useSidebarSections } from '@/composable/use-sidebar-sections';
import { InfoIcon, LayersIcon, MonitorIcon, MoonStarIcon, SunIcon } from '@lucide/vue';
import { type Component } from 'vue';

const { sidebarSections, toggleSection, isUpdating } = useSidebarSections();

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
</script>
