<template>
  <Popover.Popover>
    <Popover.PopoverTrigger as-child>
      <Button variant="secondary" size="icon" :aria-label="$t('themeSelector.toggle')">
        <MoonStarIcon v-if="currentTheme === Themes.dark" class="size-5" />
        <SunIcon v-else class="size-5" />
      </Button>
    </Popover.PopoverTrigger>
    <Popover.PopoverContent class="w-44 p-2" align="end">
      <div class="space-y-1">
        <Button
          v-for="option in options"
          :key="option.value"
          variant="ghost"
          size="sm"
          class="w-full justify-start"
          :class="{ 'bg-accent': themePreference === option.value }"
          @click="setThemePreference(option.value)"
        >
          <component :is="option.icon" class="size-4" />
          <span>{{ $t(option.labelKey) }}</span>
        </Button>
      </div>
    </Popover.PopoverContent>
  </Popover.Popover>
</template>

<script setup lang="ts">
import { ThemePreference, Themes, currentTheme, setThemePreference, themePreference } from '@/common/utils';
import Button from '@/components/lib/ui/button/Button.vue';
import * as Popover from '@/components/lib/ui/popover';
import { MonitorIcon, MoonStarIcon, SunIcon } from 'lucide-vue-next';
import type { Component } from 'vue';

interface ThemeOption {
  value: ThemePreference;
  labelKey: string;
  icon: Component;
}

const options: ThemeOption[] = [
  { value: ThemePreference.light, labelKey: 'themeSelector.light', icon: SunIcon },
  { value: ThemePreference.dark, labelKey: 'themeSelector.dark', icon: MoonStarIcon },
  { value: ThemePreference.system, labelKey: 'themeSelector.system', icon: MonitorIcon },
];
</script>
