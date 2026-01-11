<template>
  <div class="p-6">
    <div class="mb-6">
      <h1 class="text-2xl tracking-wider">{{ t('pages.importExport.csvImport.pageTitle') }}</h1>
      <p class="text-muted-foreground mt-2">
        {{ t('pages.importExport.csvImport.pageDescription') }}
      </p>
    </div>

    <div class="max-w-4xl">
      <!-- Vertical Step Sections -->
      <div class="space-y-4">
        <!-- Step 1: Upload File -->
        <div class="bg-card rounded-lg border">
          <button
            class="hover:bg-accent/50 flex w-full items-center justify-between p-4 text-left"
            @click="toggleStep(1)"
          >
            <div class="flex items-center gap-3">
              <div
                class="flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold"
                :class="{
                  'border-primary bg-primary text-primary-foreground': importStore.currentStep === 1,
                  'border-primary bg-primary/10 text-primary': importStore.completedSteps.includes(1),
                  'border-muted-foreground/30 text-muted-foreground': !canAccessStep(1),
                }"
              >
                <CheckIcon v-if="importStore.completedSteps.includes(1)" class="size-4" />
                <span v-else>1</span>
              </div>
              <div>
                <h3 class="font-semibold">{{ t('pages.importExport.csvImport.steps.uploadTitle') }}</h3>
                <p class="text-muted-foreground text-sm">
                  {{ t('pages.importExport.csvImport.steps.uploadDescription') }}
                </p>
              </div>
            </div>
            <ChevronDownIcon
              class="size-5 transition-transform duration-200"
              :class="{ 'rotate-180': importStore.currentStep === 1 }"
            />
          </button>
          <div v-if="importStore.currentStep === 1" class="border-t p-4">
            <FileUploadStep />
          </div>
        </div>

        <!-- Step 2: Column Mapping -->
        <div class="bg-card rounded-lg border">
          <button
            class="flex w-full items-center justify-between p-4 text-left"
            :class="{
              'hover:bg-accent/50': canAccessStep(2),
              'cursor-not-allowed opacity-50': !canAccessStep(2),
            }"
            :disabled="!canAccessStep(2)"
            @click="toggleStep(2)"
          >
            <div class="flex items-center gap-3">
              <div
                class="flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold"
                :class="{
                  'border-primary bg-primary text-primary-foreground': importStore.currentStep === 2,
                  'border-primary bg-primary/10 text-primary': importStore.completedSteps.includes(2),
                  'border-muted-foreground/30 text-muted-foreground': !canAccessStep(2),
                }"
              >
                <CheckIcon v-if="importStore.completedSteps.includes(2)" class="size-4" />
                <span v-else>2</span>
              </div>
              <div>
                <h3 class="font-semibold">{{ t('pages.importExport.csvImport.steps.mappingTitle') }}</h3>
                <p class="text-muted-foreground text-sm">
                  {{ t('pages.importExport.csvImport.steps.mappingDescription') }}
                </p>
              </div>
            </div>
            <ChevronDownIcon
              v-if="canAccessStep(2)"
              class="size-5 transition-transform duration-200"
              :class="{ 'rotate-180': importStore.currentStep === 2 }"
            />
            <LockIcon v-else class="text-muted-foreground size-5" />
          </button>
          <div v-if="importStore.currentStep === 2" class="border-t p-4">
            <ColumnMappingStep />
          </div>
        </div>

        <!-- Step 3: Review Duplicates -->
        <div class="bg-card rounded-lg border">
          <button
            class="flex w-full items-center justify-between p-4 text-left"
            :class="{
              'hover:bg-accent/50': canAccessStep(3),
              'cursor-not-allowed opacity-50': !canAccessStep(3),
            }"
            :disabled="!canAccessStep(3)"
            @click="toggleStep(3)"
          >
            <div class="flex items-center gap-3">
              <div
                class="flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold"
                :class="{
                  'border-primary bg-primary text-primary-foreground': importStore.currentStep === 3,
                  'border-primary bg-primary/10 text-primary': importStore.completedSteps.includes(3),
                  'border-muted-foreground/30 text-muted-foreground': !canAccessStep(3),
                }"
              >
                <CheckIcon v-if="importStore.completedSteps.includes(3)" class="size-4" />
                <span v-else>3</span>
              </div>
              <div>
                <h3 class="font-semibold">{{ t('pages.importExport.csvImport.steps.reviewTitle') }}</h3>
                <p class="text-muted-foreground text-sm">
                  {{ t('pages.importExport.csvImport.steps.reviewDescription') }}
                </p>
              </div>
            </div>
            <ChevronDownIcon
              v-if="canAccessStep(3)"
              class="size-5 transition-transform duration-200"
              :class="{ 'rotate-180': importStore.currentStep === 3 }"
            />
            <LockIcon v-else class="text-muted-foreground size-5" />
          </button>
          <div v-if="importStore.currentStep === 3" class="border-t p-4">
            <ReviewDuplicatesStep />
          </div>
        </div>

        <!-- Step 4: Import Complete -->
        <div class="bg-card rounded-lg border">
          <button
            class="flex w-full items-center justify-between p-4 text-left"
            :class="{
              'hover:bg-accent/50': canAccessStep(4),
              'cursor-not-allowed opacity-50': !canAccessStep(4),
            }"
            :disabled="!canAccessStep(4)"
            @click="toggleStep(4)"
          >
            <div class="flex items-center gap-3">
              <div
                class="flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold"
                :class="{
                  'border-primary bg-primary text-primary-foreground': importStore.currentStep === 4,
                  'border-primary bg-primary/10 text-primary': importStore.completedSteps.includes(4),
                  'border-muted-foreground/30 text-muted-foreground': !canAccessStep(4),
                }"
              >
                <CheckIcon v-if="importStore.completedSteps.includes(4)" class="size-4" />
                <span v-else>4</span>
              </div>
              <div>
                <h3 class="font-semibold">{{ t('pages.importExport.csvImport.steps.completeTitle') }}</h3>
                <p class="text-muted-foreground text-sm">
                  {{ t('pages.importExport.csvImport.steps.completeDescription') }}
                </p>
              </div>
            </div>
            <ChevronDownIcon
              v-if="canAccessStep(4)"
              class="size-5 transition-transform duration-200"
              :class="{ 'rotate-180': importStore.currentStep === 4 }"
            />
            <LockIcon v-else class="text-muted-foreground size-5" />
          </button>
          <div v-if="importStore.currentStep === 4" class="border-t p-4">
            <ImportResultsStep />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { trackAnalyticsEvent } from '@/lib/posthog';
import { useImportExportStore } from '@/stores/import-export';
import { CheckIcon, ChevronDownIcon, LockIcon } from 'lucide-vue-next';
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';

import ColumnMappingStep from './components/column-mapping-step/index.vue';
import FileUploadStep from './components/file-upload-step/index.vue';
import ImportResultsStep from './components/import-results-step/index.vue';
import ReviewDuplicatesStep from './components/review-duplicates-step/index.vue';

onMounted(() => {
  trackAnalyticsEvent({ event: 'import_opened', properties: { import_type: 'csv' } });
});

const { t } = useI18n();

const importStore = useImportExportStore();

const canAccessStep = (stepNumber: number): boolean => {
  // Step 1 is always accessible
  if (stepNumber === 1) return true;

  // Other steps require previous steps to be completed
  return importStore.completedSteps.includes(stepNumber - 1);
};

const toggleStep = (stepNumber: number) => {
  if (!canAccessStep(stepNumber)) return;

  // If clicking current step, keep it open (don't collapse)
  // If clicking different step, switch to it
  if (importStore.currentStep !== stepNumber) {
    importStore.currentStep = stepNumber;
  }
};
</script>
