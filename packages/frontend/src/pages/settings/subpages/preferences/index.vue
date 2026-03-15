<template>
  <Card class="max-w-4xl">
    <CardHeader class="border-b">
      <h2 class="mb-2 text-2xl font-semibold">{{ $t('settings.preferences.title') }}</h2>
      <p class="text-sm opacity-80">{{ $t('settings.preferences.description') }}</p>
    </CardHeader>

    <CardContent class="mt-6 flex flex-col gap-6">
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
import Button from '@/components/lib/ui/button/Button.vue';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { useOnboardingStore } from '@/stores/onboarding';
import { RocketIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { ref } from 'vue';

const onboardingStore = useOnboardingStore();
const { isDismissed } = storeToRefs(onboardingStore);

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
