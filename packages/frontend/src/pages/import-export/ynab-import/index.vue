<template>
  <Card class="max-w-4xl">
    <CardHeader class="border-b">
      <RouterLink
        :to="{ name: ROUTES_NAMES.settingsDataManagementImport }"
        class="text-muted-foreground hover:text-foreground mb-3 inline-flex w-fit items-center gap-1 text-sm transition-colors"
      >
        <ChevronLeftIcon class="size-4" />
        {{ $t('settings.dataManagement.import.back') }}
      </RouterLink>
      <h2 class="mb-2 text-2xl font-semibold text-balance">
        {{ $t('pages.importExport.ynabImport.pageTitle') }}
      </h2>
      <p class="text-sm opacity-80">
        {{ $t('pages.importExport.ynabImport.pageDescription') }}
      </p>
    </CardHeader>

    <CardContent class="mt-6">
      <div class="space-y-4">
        <YnabStepShell
          v-for="step in STEPS"
          :key="step.number"
          :step-number="step.number"
          :title="$t(`pages.importExport.ynabImport.steps.${step.key}Title`)"
          :description="$t(`pages.importExport.ynabImport.steps.${step.key}Description`)"
          :is-current="store.currentStep === step.number"
          :is-completed="store.currentStep > step.number"
          :is-accessible="store.currentStep >= step.number"
        >
          <component :is="step.component" />
        </YnabStepShell>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { trackAnalyticsEvent } from '@/lib/posthog';
import { ROUTES_NAMES } from '@/routes';
import { useImportYnabStore } from '@/stores/import-ynab';
import { ChevronLeftIcon } from '@lucide/vue';
import { onMounted } from 'vue';
import { RouterLink } from 'vue-router';

import DoneStep from './components/done-step.vue';
import ExecuteStep from './components/execute-step.vue';
import FileUploadStep from './components/file-upload-step.vue';
import PreviewStep from './components/preview-step.vue';
import YnabStepShell from './components/ynab-step-shell.vue';

const STEPS = [
  { number: 1, key: 'upload', component: FileUploadStep },
  { number: 2, key: 'preview', component: PreviewStep },
  { number: 3, key: 'execute', component: ExecuteStep },
  { number: 4, key: 'done', component: DoneStep },
] as const;

const store = useImportYnabStore();

onMounted(() => {
  trackAnalyticsEvent({ event: 'import_opened', properties: { import_type: 'ynab' } });
});
</script>
