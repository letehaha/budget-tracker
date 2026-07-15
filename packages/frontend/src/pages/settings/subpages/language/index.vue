<template>
  <Card class="max-w-4xl">
    <CardHeader class="border-b">
      <h2 class="mb-2 text-2xl font-semibold">{{ $t('settings.language.title') }}</h2>
      <p class="text-sm opacity-80">{{ $t('settings.language.description') }}</p>
    </CardHeader>

    <CardContent class="mt-6 space-y-6">
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

      <div class="bg-muted/40 @container grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1 rounded-lg border p-4">
        <LanguagesIcon class="text-primary mt-0.5 size-5 shrink-0" />

        <h3 class="text-sm font-medium">{{ $t('settings.language.contribute.title') }}</h3>

        <p class="text-muted-foreground col-span-2 text-sm @min-[400px]:col-span-1 @min-[400px]:col-start-2">
          {{ $t('settings.language.contribute.description') }}
        </p>

        <i18n-t
          keypath="settings.language.contribute.requestNote"
          tag="p"
          class="text-muted-foreground col-span-2 mt-2 text-sm @min-[400px]:col-span-1 @min-[400px]:col-start-2"
        >
          <template #boardLink>
            <a
              :href="EXTERNAL_URLS.featurebaseRoadmap"
              target="_blank"
              rel="noopener noreferrer"
              class="font-medium underline underline-offset-2 hover:no-underline"
              @click="handleRequestBoardClick"
            >
              {{ $t('settings.language.contribute.requestNoteLink') }}
            </a>
          </template>
        </i18n-t>

        <div class="col-span-2 mt-2 @min-[400px]:col-span-1 @min-[400px]:col-start-2">
          <Button
            as="a"
            :href="EXTERNAL_URLS.crowdinProject"
            target="_blank"
            rel="noopener noreferrer"
            variant="outline"
            size="sm"
            @click="handleContributeClick"
          >
            {{ $t('settings.language.contribute.action') }}
            <ExternalLinkIcon class="size-4" />
          </Button>
        </div>
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
import { EXTERNAL_URLS } from '@bt/shared/const/external-urls';
import { LOCALE_NAMES, SUPPORTED_LOCALES, type SupportedLocale } from '@bt/shared/i18n/locales';
import { ExternalLinkIcon, LanguagesIcon } from '@lucide/vue';
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

const handleContributeClick = () => {
  trackAnalyticsEvent({
    event: 'crowdin_contribute_clicked',
    properties: { current_locale: currentLocale.value },
  });
};

const handleRequestBoardClick = () => {
  trackAnalyticsEvent({
    event: 'language_request_board_clicked',
    properties: { current_locale: currentLocale.value },
  });
};

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
