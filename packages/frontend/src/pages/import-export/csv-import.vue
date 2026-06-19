<template>
  <div class="@container/csv-wizard flex flex-col gap-0">
    <!-- Page header -->
    <div class="mb-6">
      <RouterLink
        :to="{ name: ROUTES_NAMES.settingsDataManagementImport }"
        class="text-muted-foreground hover:text-foreground mb-3 inline-flex w-fit items-center gap-1 text-sm transition-colors"
      >
        <ChevronLeftIcon class="size-4" />
        {{ $t('settings.dataManagement.import.back') }}
      </RouterLink>
      <h2 class="mb-2 text-2xl font-semibold text-balance">
        {{ $t('pages.importExport.csvImport.pageTitle') }}
      </h2>
      <p class="text-muted-foreground text-sm">
        {{ $t('pages.importExport.csvImport.pageDescription') }}
      </p>
    </div>

    <!-- Stepper header — numbered circles for every step. On a narrow container only the current
         step is labelled (row stays on one line, no overflow); at @3xl every step shows its label.
         Container-query driven so it reacts to the content width, not the viewport (sidebar). -->
    <div class="bg-card mb-6 rounded-xl border px-4 py-3">
      <div class="flex items-center">
        <template v-for="(step, index) in store.visibleSteps" :key="step.key">
          <!-- Connector before each step except the first; fills primary once the step is reached -->
          <div
            v-if="index > 0"
            class="mx-2 h-0.5 flex-1 rounded-full transition-colors duration-300"
            :class="
              store.completedStepKeys.has(step.key) || store.currentStepKey === step.key ? 'bg-primary' : 'bg-border'
            "
          />

          <!-- Step indicator: completed steps click to jump back; every step reveals its label via
               ResponsiveTooltip (hover on desktop, tap-popover on touch) since narrow rows hide labels. -->
          <ResponsiveTooltip :content="$t(STEP_LABEL_KEYS[step.key])">
            <!-- Span wraps the trigger so the tooltip/popover still fires for disabled (non-completed)
                 steps: a disabled <button> swallows pointer events, so the span must catch them. -->
            <span
              class="inline-flex shrink-0"
              :class="
                !store.completedStepKeys.has(step.key) && store.currentStepKey !== step.key
                  ? 'cursor-not-allowed'
                  : 'cursor-default'
              "
            >
              <button
                type="button"
                class="flex shrink-0 items-center gap-2 rounded-md transition-colors disabled:pointer-events-none"
                :disabled="!store.completedStepKeys.has(step.key)"
                :aria-current="store.currentStepKey === step.key ? 'step' : undefined"
                :aria-label="$t(STEP_LABEL_KEYS[step.key])"
                @click="store.completedStepKeys.has(step.key) ? store.goToStep(step.key) : undefined"
              >
                <span
                  class="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors duration-300"
                  :class="
                    store.completedStepKeys.has(step.key) || store.currentStepKey === step.key
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground bg-transparent'
                  "
                >
                  <CheckIcon v-if="store.completedStepKeys.has(step.key)" class="size-3.5" />
                  <span v-else>{{ index + 1 }}</span>
                </span>
                <!-- Current step always labelled; others only at @3xl, so a narrow row stays one line -->
                <span
                  class="text-sm whitespace-nowrap"
                  :class="
                    store.currentStepKey === step.key
                      ? 'text-foreground inline font-semibold'
                      : store.completedStepKeys.has(step.key)
                        ? 'text-foreground hidden font-medium @3xl/csv-wizard:inline'
                        : 'text-muted-foreground hidden font-medium @3xl/csv-wizard:inline'
                  "
                >
                  {{ $t(STEP_LABEL_KEYS[step.key]) }}
                </span>
              </button>
            </span>
          </ResponsiveTooltip>
        </template>
      </div>
    </div>

    <!-- Active step panel -->
    <div class="min-w-0">
      <FileUploadStep v-if="store.currentStepKey === 'upload'" />
      <ColumnMappingStep v-else-if="store.currentStepKey === 'map'" />
      <ResolveValuesStep v-else-if="store.currentStepKey === 'resolve'" />
      <ReviewDuplicatesStep v-else-if="store.currentStepKey === 'review'" />
      <ImportResultsStep v-else-if="store.currentStepKey === 'results'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import ResponsiveTooltip from '@/components/common/responsive-tooltip.vue';
import { ROUTES_NAMES } from '@/routes';
import { type ImportStepKey, useImportExportStore } from '@/stores/import-export';
import { CheckIcon, ChevronLeftIcon } from '@lucide/vue';
import { onMounted } from 'vue';
import { RouterLink } from 'vue-router';

import ColumnMappingStep from './components/column-mapping-step/index.vue';
import FileUploadStep from './components/file-upload-step/index.vue';
import ImportResultsStep from './components/import-results-step/index.vue';
import ResolveValuesStep from './components/resolve-values-step/index.vue';
import ReviewDuplicatesStep from './components/review-duplicates-step/index.vue';

/** i18n key for each step label. */
const STEP_LABEL_KEYS: Record<ImportStepKey, string> = {
  upload: 'pages.importExport.csvImport.stepper.steps.upload',
  map: 'pages.importExport.csvImport.stepper.steps.map',
  resolve: 'pages.importExport.csvImport.stepper.steps.resolve',
  review: 'pages.importExport.csvImport.stepper.steps.review',
  results: 'pages.importExport.csvImport.stepper.steps.results',
};

const store = useImportExportStore();

onMounted(() => {
  store.reset();
});
</script>
