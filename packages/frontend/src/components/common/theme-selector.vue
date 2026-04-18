<template>
  <Popover.Popover>
    <Popover.PopoverTrigger as-child>
      <Button variant="secondary" size="icon">
        <MoonStar v-if="currentTheme === Themes.dark" class="size-5" />
        <Sun v-else class="size-5" />
      </Button>
    </Popover.PopoverTrigger>
    <Popover.PopoverContent class="w-44" align="end">
      <div class="space-y-1">
        <button
          v-for="option in options"
          :key="option.value"
          class="hover:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors"
          :class="{ 'bg-accent': themePreference === option.value }"
          @click="setThemePreference(option.value)"
        >
          <component :is="option.icon" class="size-4" />
          <span>{{ option.label }}</span>
        </button>
      </div>
    </Popover.PopoverContent>
  </Popover.Popover>
</template>

<script setup lang="ts">
import { ThemePreference, Themes, currentTheme, setThemePreference, themePreference } from '@/common/utils';
import Button from '@/components/lib/ui/button/Button.vue';
import * as Popover from '@/components/lib/ui/popover';
import { MonitorIcon, MoonStar, Sun } from 'lucide-vue-next';

const options = [
  { value: ThemePreference.light, label: 'Light', icon: Sun },
  { value: ThemePreference.dark, label: 'Dark', icon: MoonStar },
  { value: ThemePreference.system, label: 'System', icon: MonitorIcon },
];
</script>
