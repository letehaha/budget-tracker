<template>
  <PageWrapper class="pt-4">
    <BackLink :to="{ name: ROUTES_NAMES.settingsDataManagement }">{{
      $t('pages.statementParser.backToSettings')
    }}</BackLink>

    <div class="mb-6">
      <h1 class="text-2xl tracking-wider">{{ $t('pages.statementParser.pageTitle') }}</h1>
      <p class="text-muted-foreground mt-2">
        {{ $t('pages.statementParser.pageDescription') }}
      </p>
    </div>

    <div class="max-w-4xl">
      <!-- Vertical Step Sections -->
      <div class="space-y-4">
        <!-- Step 1: Upload & Extract -->
        <div ref="step1Ref" class="bg-card scroll-mt-20 rounded-lg border">
          <div class="flex w-full items-center justify-between p-4 text-left">
            <div class="flex items-center gap-3">
              <div
                class="flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold"
                :class="{
                  'border-primary bg-primary text-primary-foreground': store.currentStep === 1,
                  'border-primary bg-primary/10 text-primary': isStepCompleted(1) && store.currentStep !== 1,
                  'border-muted-foreground/30 text-muted-foreground': isStepLocked(1),
                }"
              >
                <CheckIcon v-if="isStepCompleted(1) && store.currentStep !== 1" class="size-4" />
                <span v-else>1</span>
              </div>
              <div>
                <h3 class="font-semibold">{{ $t('pages.statementParser.steps.uploadTitle') }}</h3>
                <p class="text-muted-foreground text-sm">{{ $t('pages.statementParser.steps.uploadDescription') }}</p>
              </div>
            </div>
            <ChevronDownIcon
              class="size-5 transition-transform duration-200"
              :class="{ 'rotate-180': store.currentStep === 1 }"
            />
          </div>
          <div v-if="store.currentStep === 1" class="border-t p-4">
            <UploadExtractStep />
          </div>
        </div>

        <!-- Step 2: Account Selection -->
        <div ref="step2Ref" class="bg-card scroll-mt-20 rounded-lg border">
          <div
            class="flex w-full items-center justify-between p-4 text-left"
            :class="{ 'opacity-50': isStepLocked(2) }"
          >
            <div class="flex items-center gap-3">
              <div
                class="flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold"
                :class="{
                  'border-primary bg-primary text-primary-foreground': store.currentStep === 2,
                  'border-primary bg-primary/10 text-primary': isStepCompleted(2) && store.currentStep !== 2,
                  'border-muted-foreground/30 text-muted-foreground': isStepLocked(2),
                }"
              >
                <CheckIcon v-if="isStepCompleted(2) && store.currentStep !== 2" class="size-4" />
                <span v-else>2</span>
              </div>
              <div>
                <h3 class="font-semibold">{{ $t('pages.statementParser.steps.accountTitle') }}</h3>
                <p class="text-muted-foreground text-sm">{{ $t('pages.statementParser.steps.accountDescription') }}</p>
              </div>
            </div>
            <ChevronDownIcon
              v-if="!isStepLocked(2)"
              class="size-5 transition-transform duration-200"
              :class="{ 'rotate-180': store.currentStep === 2 }"
            />
            <LockIcon v-else class="text-muted-foreground size-5" />
          </div>
          <div v-if="store.currentStep === 2" class="border-t p-4">
            <AccountSelectionStep />
          </div>
        </div>

        <!-- Step 3: Review Duplicates (only for existing accounts) -->
        <div
          v-if="!store.isNewAccount || isStepCompleted(3)"
          ref="step3Ref"
          class="bg-card scroll-mt-20 rounded-lg border"
        >
          <div
            class="flex w-full items-center justify-between p-4 text-left"
            :class="{ 'opacity-50': isStepLocked(3) }"
          >
            <div class="flex items-center gap-3">
              <div
                class="flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold"
                :class="{
                  'border-primary bg-primary text-primary-foreground': store.currentStep === 3,
                  'border-primary bg-primary/10 text-primary': isStepCompleted(3) && store.currentStep !== 3,
                  'border-muted-foreground/30 text-muted-foreground': isStepLocked(3),
                }"
              >
                <CheckIcon v-if="isStepCompleted(3) && store.currentStep !== 3" class="size-4" />
                <span v-else>3</span>
              </div>
              <div>
                <h3 class="font-semibold">{{ $t('pages.statementParser.steps.reviewTitle') }}</h3>
                <p class="text-muted-foreground text-sm">{{ $t('pages.statementParser.steps.reviewDescription') }}</p>
              </div>
            </div>
            <ChevronDownIcon
              v-if="!isStepLocked(3)"
              class="size-5 transition-transform duration-200"
              :class="{ 'rotate-180': store.currentStep === 3 }"
            />
            <LockIcon v-else class="text-muted-foreground size-5" />
          </div>
          <div v-if="store.currentStep === 3" class="border-t p-4">
            <TransactionReviewStep />
          </div>
        </div>

        <!-- Step 4: Import -->
        <div ref="step4Ref" class="bg-card scroll-mt-20 rounded-lg border">
          <div
            class="flex w-full items-center justify-between p-4 text-left"
            :class="{ 'opacity-50': isStepLocked(4) }"
          >
            <div class="flex items-center gap-3">
              <div
                class="flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold"
                :class="{
                  'border-primary bg-primary text-primary-foreground': store.currentStep === 4,
                  'border-primary bg-primary/10 text-primary': isStepCompleted(4) && store.currentStep !== 4,
                  'border-muted-foreground/30 text-muted-foreground': isStepLocked(4),
                }"
              >
                <CheckIcon v-if="isStepCompleted(4) && store.currentStep !== 4" class="size-4" />
                <span v-else>{{ store.isNewAccount ? '3' : '4' }}</span>
              </div>
              <div>
                <h3 class="font-semibold">{{ $t('pages.statementParser.steps.importTitle') }}</h3>
                <p class="text-muted-foreground text-sm">{{ $t('pages.statementParser.steps.importDescription') }}</p>
              </div>
            </div>
            <ChevronDownIcon
              v-if="!isStepLocked(4)"
              class="size-5 transition-transform duration-200"
              :class="{ 'rotate-180': store.currentStep === 4 }"
            />
            <LockIcon v-else class="text-muted-foreground size-5" />
          </div>
          <div v-if="store.currentStep === 4" class="border-t p-4">
            <ImportResultsStep />
          </div>
        </div>
      </div>
    </div>
  </PageWrapper>
</template>

<script setup lang="ts">
import BackLink from '@/components/common/back-link.vue';
import PageWrapper from '@/components/common/page-wrapper.vue';
import { trackAnalyticsEvent } from '@/lib/posthog';
import { ROUTES_NAMES } from '@/routes';
import { useStatementParserStore } from '@/stores/statement-parser';
import { CheckIcon, ChevronDownIcon, LockIcon } from 'lucide-vue-next';
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

import AccountSelectionStep from './components/account-selection-step.vue';
import ImportResultsStep from './components/import-results-step.vue';
import TransactionReviewStep from './components/transaction-review-step.vue';
import UploadExtractStep from './components/upload-extract-step.vue';

onMounted(() => {
  trackAnalyticsEvent({ event: 'import_opened', properties: { import_type: 'statement_parser' } });
});

const store = useStatementParserStore();

const step1Ref = ref<HTMLElement | null>(null);
const step2Ref = ref<HTMLElement | null>(null);
const step3Ref = ref<HTMLElement | null>(null);
const step4Ref = ref<HTMLElement | null>(null);

const scrollToStep = async (step: number) => {
  await nextTick();

  const stepRefs: Record<number, typeof step1Ref> = {
    1: step1Ref,
    2: step2Ref,
    3: step3Ref,
    4: step4Ref,
  };

  const stepRef = stepRefs[step]?.value;
  if (stepRef) {
    setTimeout(() => {
      stepRef.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 200);
  }
};

watch(
  () => store.currentStep,
  (newStep, oldStep) => {
    // Only scroll when moving forward to a new step
    if (newStep > oldStep) {
      scrollToStep(newStep);
    }
  },
);

const isStepCompleted = (stepNumber: number): boolean => {
  return store.completedSteps.includes(stepNumber);
};

const isStepLocked = (stepNumber: number): boolean => {
  // A step is locked if it's not the current step and not completed
  return store.currentStep !== stepNumber && !store.completedSteps.includes(stepNumber);
};

// Reset store when leaving the page
onUnmounted(() => {
  // Optionally reset - commented out to allow coming back
  // store.reset();
});
</script>
