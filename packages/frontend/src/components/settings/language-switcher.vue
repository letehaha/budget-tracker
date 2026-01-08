<template>
  <div class="space-y-4">
    <div>
      <h3 class="mb-1 text-lg font-medium">Language</h3>
      <p class="text-muted-foreground text-sm">Select your preferred language for the application</p>
    </div>

    <div class="space-y-2">
      <label
        v-for="locale in locales"
        :key="locale.value"
        class="border-input hover:bg-accent flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors"
        :class="{
          'bg-accent ring-ring ring-2': selectedLocale === locale.value,
        }"
      >
        <input
          type="radio"
          name="language"
          :value="locale.value"
          :checked="selectedLocale === locale.value"
          class="text-primary focus:ring-primary size-4"
          @change="handleLocaleChange(locale.value)"
        />
        <div class="flex flex-1 items-center gap-3">
          <span class="text-2xl">{{ locale.flag }}</span>
          <div class="flex-1">
            <div class="font-medium">{{ locale.native }}</div>
            <div class="text-muted-foreground text-sm">{{ locale.english }}</div>
          </div>
        </div>
      </label>
    </div>

    <div v-if="updateError" class="text-destructive-text text-sm">
      Failed to save language preference. Please try again.
    </div>
  </div>
</template>

<script setup lang="ts">
import { api } from '@/api';
import { useNotificationCenter } from '@/components/notification-center';
import { setLocale } from '@/i18n';
import { LOCALE_NAMES, SUPPORTED_LOCALES, type SupportedLocale } from '@bt/shared/i18n/locales';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

const { addSuccessNotification } = useNotificationCenter();
const { t } = useI18n();
const queryClient = useQueryClient();

const props = defineProps<{
  initialLocale: SupportedLocale;
}>();

const selectedLocale = ref<SupportedLocale>(props.initialLocale);
const updateError = ref(false);

// Locale options for the UI
const locales = [
  {
    value: SUPPORTED_LOCALES.ENGLISH,
    native: LOCALE_NAMES[SUPPORTED_LOCALES.ENGLISH].native,
    english: LOCALE_NAMES[SUPPORTED_LOCALES.ENGLISH].english,
    flag: LOCALE_NAMES[SUPPORTED_LOCALES.ENGLISH].flag,
  },
  {
    value: SUPPORTED_LOCALES.UKRAINIAN,
    native: LOCALE_NAMES[SUPPORTED_LOCALES.UKRAINIAN].native,
    english: LOCALE_NAMES[SUPPORTED_LOCALES.UKRAINIAN].english,
    flag: LOCALE_NAMES[SUPPORTED_LOCALES.UKRAINIAN].flag,
  },
];

// Mutation to update user settings
const updateLocaleMutation = useMutation({
  mutationFn: async ({ locale }: { locale: SupportedLocale }) => {
    // Get current settings
    const currentSettings = await api.get('/user/settings');

    // Update with new locale
    return api.put('/user/settings', {
      ...currentSettings,
      locale,
    });
  },
  onSuccess: () => {
    addSuccessNotification(t('common.notifications.languagePreferenceSaved'));
    queryClient.invalidateQueries({ queryKey: ['user', 'settings'] });
    updateError.value = false;
  },
  onError: () => {
    updateError.value = true;
  },
});

async function handleLocaleChange(locale: SupportedLocale) {
  selectedLocale.value = locale;

  // Update UI immediately
  await setLocale(locale);

  // Persist to backend
  updateLocaleMutation.mutate({ locale });
}
</script>
