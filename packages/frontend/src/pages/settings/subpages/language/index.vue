<template>
  <Card class="max-w-4xl">
    <CardHeader class="border-b">
      <h2 class="mb-2 text-2xl font-semibold">{{ $t('settings.language.title') }}</h2>
      <p class="text-sm opacity-80">{{ $t('settings.language.description') }}</p>
    </CardHeader>

    <CardContent class="mt-6">
      <div class="flex flex-wrap gap-2">
        <Button
          v-for="locale in availableLocales"
          :key="locale.value"
          :variant="currentLocale === locale.value ? 'default' : 'outline'"
          size="sm"
          :disabled="isUpdating"
          @click="handleLocaleChange(locale.value)"
        >
          <img :src="locale.flagSrc" :alt="locale.native" class="h-4 w-5.5 rounded-sm object-cover" />
          <span>{{ locale.native }}</span>
        </Button>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import Button from '@/components/lib/ui/button/Button.vue';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { useUserSettings } from '@/composable/data-queries/user-settings';
import { getCurrentLocale, setLocale } from '@/i18n';
import { trackAnalyticsEvent } from '@/lib/posthog';
import { LOCALE_NAMES, SUPPORTED_LOCALES, type SupportedLocale } from '@bt/shared/i18n/locales';
import { ref } from 'vue';

const { data: userSettings, mutateAsync, isUpdating } = useUserSettings();

const FLAG_SRCS: Record<SupportedLocale, string> = {
  [SUPPORTED_LOCALES.ENGLISH]: '/img/flags/gb.svg',
  [SUPPORTED_LOCALES.UKRAINIAN]: '/img/flags/ua.svg',
  [SUPPORTED_LOCALES.SPANISH]: '/img/flags/es.png',
  [SUPPORTED_LOCALES.INDONESIAN]: '/img/flags/id.svg',
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
  {
    value: SUPPORTED_LOCALES.SPANISH,
    native: LOCALE_NAMES[SUPPORTED_LOCALES.SPANISH].native,
    flagSrc: FLAG_SRCS[SUPPORTED_LOCALES.SPANISH],
  },
  {
    value: SUPPORTED_LOCALES.INDONESIAN,
    native: LOCALE_NAMES[SUPPORTED_LOCALES.INDONESIAN].native,
    flagSrc: FLAG_SRCS[SUPPORTED_LOCALES.INDONESIAN],
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
    await mutateAsync({ ...userSettings.value, locale });
  } catch {
    // localStorage is already updated by setLocale; backend persistence is best-effort
    console.error('Failed to persist locale to backend');
  }
};
</script>
