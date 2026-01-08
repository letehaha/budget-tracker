<template>
  <Popover.Popover>
    <Popover.PopoverTrigger as-child>
      <Button :variant="variant" :size="showLabel ? 'default' : 'icon'" :class="buttonClass">
        <template v-if="showLabel">
          <span>{{ currentLocaleNative }}</span>
          <span class="text-lg">{{ currentLocaleFlag }}</span>
        </template>
        <template v-else>
          <span class="text-lg">{{ currentLocaleFlag }}</span>
        </template>
      </Button>
    </Popover.PopoverTrigger>
    <Popover.PopoverContent class="w-44" align="end">
      <div class="space-y-1">
        <div v-if="showHeader" class="mb-2 text-sm font-medium">
          {{ $t('header.language') }}
        </div>
        <button
          v-for="locale in availableLocales"
          :key="locale.value"
          class="hover:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors"
          :class="{
            'bg-accent': currentLocale === locale.value,
          }"
          @click="handleLocaleChange(locale.value)"
        >
          <span class="text-lg">{{ locale.flag }}</span>
          <span>{{ locale.native }}</span>
        </button>
      </div>
    </Popover.PopoverContent>
  </Popover.Popover>
</template>

<script setup lang="ts">
import { api } from '@/api';
import Button from '@/components/lib/ui/button/Button.vue';
import * as Popover from '@/components/lib/ui/popover';
import { getCurrentLocale, setLocale } from '@/i18n';
import { LOCALE_NAMES, SUPPORTED_LOCALES, type SupportedLocale } from '@bt/shared/i18n/locales';
import { useQueryClient } from '@tanstack/vue-query';
import { computed, ref } from 'vue';

const props = withDefaults(
  defineProps<{
    /** Button variant */
    variant?: 'default' | 'secondary' | 'outline' | 'ghost';
    /** Additional classes for the button */
    buttonClass?: string;
    /** Whether to show the "Language" header in popover */
    showHeader?: boolean;
    /** Whether to show language name alongside flag in button */
    showLabel?: boolean;
    /** Whether to persist locale to backend (requires authenticated user) */
    persistToBackend?: boolean;
  }>(),
  {
    variant: 'outline',
    buttonClass: '',
    showHeader: false,
    showLabel: false,
    persistToBackend: false,
  },
);

const queryClient = useQueryClient();

const currentLocale = ref<SupportedLocale>(getCurrentLocale() as SupportedLocale);

const currentLocaleFlag = computed(() => LOCALE_NAMES[currentLocale.value].flag);
const currentLocaleNative = computed(() => LOCALE_NAMES[currentLocale.value].native);

const availableLocales = [
  {
    value: SUPPORTED_LOCALES.ENGLISH,
    native: LOCALE_NAMES[SUPPORTED_LOCALES.ENGLISH].native,
    flag: LOCALE_NAMES[SUPPORTED_LOCALES.ENGLISH].flag,
  },
  {
    value: SUPPORTED_LOCALES.UKRAINIAN,
    native: LOCALE_NAMES[SUPPORTED_LOCALES.UKRAINIAN].native,
    flag: LOCALE_NAMES[SUPPORTED_LOCALES.UKRAINIAN].flag,
  },
];

async function handleLocaleChange(locale: SupportedLocale) {
  currentLocale.value = locale;
  await setLocale(locale);

  // Optionally persist to backend for authenticated users
  if (props.persistToBackend) {
    try {
      const currentSettings = await api.get('/user/settings');
      await api.put('/user/settings', {
        ...currentSettings,
        locale,
      });
      queryClient.invalidateQueries({ queryKey: ['user', 'settings'] });
    } catch {
      // Silently fail - localStorage is already updated
      console.error('Failed to persist locale to backend');
    }
  }
}
</script>
