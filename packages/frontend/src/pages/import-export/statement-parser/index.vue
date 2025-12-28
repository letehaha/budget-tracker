<template>
  <div class="p-6">
    <div class="mb-6">
      <h1 class="text-2xl tracking-wider">Statement Parser</h1>
      <p class="text-muted-foreground mt-2">
        Upload a bank statement (PDF, CSV, or TXT) to extract transactions using AI. Requires an AI API key configured
        in settings.
      </p>
    </div>

    <div class="max-w-4xl">
      <!-- Vertical Step Sections -->
      <div class="space-y-4">
        <!-- Step 1: Upload & Extract -->
        <div ref="step1Ref" class="bg-card scroll-mt-20 rounded-lg border">
          <button
            class="hover:bg-accent/50 flex w-full items-center justify-between p-4 text-left"
            @click="toggleStep(1)"
          >
            <div class="flex items-center gap-3">
              <div
                class="flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold"
                :class="{
                  'border-primary bg-primary text-primary-foreground': store.currentStep === 1,
                  'border-primary bg-primary/10 text-primary': store.completedSteps.includes(1),
                  'border-muted-foreground/30 text-muted-foreground': !canAccessStep(1),
                }"
              >
                <CheckIcon v-if="store.completedSteps.includes(1)" class="size-4" />
                <span v-else>1</span>
              </div>
              <div>
                <h3 class="font-semibold">Upload & Extract</h3>
                <p class="text-muted-foreground text-sm">Upload statement and extract transactions with AI</p>
              </div>
            </div>
            <ChevronDownIcon
              class="size-5 transition-transform duration-200"
              :class="{ 'rotate-180': store.currentStep === 1 }"
            />
          </button>
          <div v-if="store.currentStep === 1" class="border-t p-4">
            <UploadExtractStep />
          </div>
        </div>

        <!-- Step 2: Account Selection -->
        <div ref="step2Ref" class="bg-card scroll-mt-20 rounded-lg border">
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
                  'border-primary bg-primary text-primary-foreground': store.currentStep === 2,
                  'border-primary bg-primary/10 text-primary': store.completedSteps.includes(2),
                  'border-muted-foreground/30 text-muted-foreground': !canAccessStep(2),
                }"
              >
                <CheckIcon v-if="store.completedSteps.includes(2)" class="size-4" />
                <span v-else>2</span>
              </div>
              <div>
                <h3 class="font-semibold">Select Account</h3>
                <p class="text-muted-foreground text-sm">Choose or create an account for the transactions</p>
              </div>
            </div>
            <ChevronDownIcon
              v-if="canAccessStep(2)"
              class="size-5 transition-transform duration-200"
              :class="{ 'rotate-180': store.currentStep === 2 }"
            />
            <LockIcon v-else class="text-muted-foreground size-5" />
          </button>
          <div v-if="store.currentStep === 2" class="border-t p-4">
            <AccountSelectionStep />
          </div>
        </div>

        <!-- Step 3: Review Duplicates (only for existing accounts) -->
        <div
          v-if="!store.isNewAccount || store.completedSteps.includes(3)"
          ref="step3Ref"
          class="bg-card scroll-mt-20 rounded-lg border"
        >
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
                  'border-primary bg-primary text-primary-foreground': store.currentStep === 3,
                  'border-primary bg-primary/10 text-primary': store.completedSteps.includes(3),
                  'border-muted-foreground/30 text-muted-foreground': !canAccessStep(3),
                }"
              >
                <CheckIcon v-if="store.completedSteps.includes(3)" class="size-4" />
                <span v-else>3</span>
              </div>
              <div>
                <h3 class="font-semibold">Review Transactions</h3>
                <p class="text-muted-foreground text-sm">Review and handle duplicate transactions</p>
              </div>
            </div>
            <ChevronDownIcon
              v-if="canAccessStep(3)"
              class="size-5 transition-transform duration-200"
              :class="{ 'rotate-180': store.currentStep === 3 }"
            />
            <LockIcon v-else class="text-muted-foreground size-5" />
          </button>
          <div v-if="store.currentStep === 3" class="border-t p-4">
            <TransactionReviewStep />
          </div>
        </div>

        <!-- Step 4: Import -->
        <div ref="step4Ref" class="bg-card scroll-mt-20 rounded-lg border">
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
                  'border-primary bg-primary text-primary-foreground': store.currentStep === 4,
                  'border-primary bg-primary/10 text-primary': store.completedSteps.includes(4),
                  'border-muted-foreground/30 text-muted-foreground': !canAccessStep(4),
                }"
              >
                <CheckIcon v-if="store.completedSteps.includes(4)" class="size-4" />
                <span v-else>{{ store.isNewAccount ? '3' : '4' }}</span>
              </div>
              <div>
                <h3 class="font-semibold">Import</h3>
                <p class="text-muted-foreground text-sm">Execute import and view results</p>
              </div>
            </div>
            <ChevronDownIcon
              v-if="canAccessStep(4)"
              class="size-5 transition-transform duration-200"
              :class="{ 'rotate-180': store.currentStep === 4 }"
            />
            <LockIcon v-else class="text-muted-foreground size-5" />
          </button>
          <div v-if="store.currentStep === 4" class="border-t p-4">
            <ImportResultsStep />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useStatementParserStore } from '@/stores/statement-parser';
import { CheckIcon, ChevronDownIcon, LockIcon } from 'lucide-vue-next';
import { nextTick, onUnmounted, ref, watch } from 'vue';

import AccountSelectionStep from './components/account-selection-step.vue';
import ImportResultsStep from './components/import-results-step.vue';
import TransactionReviewStep from './components/transaction-review-step.vue';
import UploadExtractStep from './components/upload-extract-step.vue';

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

const canAccessStep = (stepNumber: number): boolean => {
  // Step 1 is always accessible
  if (stepNumber === 1) return true;

  // For new accounts, step 3 (review) is skipped, so step 4 requires step 2
  if (store.isNewAccount && stepNumber === 4) {
    return store.completedSteps.includes(2);
  }

  // Other steps require previous steps to be completed
  return store.completedSteps.includes(stepNumber - 1);
};

const toggleStep = (stepNumber: number) => {
  if (!canAccessStep(stepNumber)) return;

  // If clicking current step, keep it open (don't collapse)
  // If clicking different step, switch to it
  if (store.currentStep !== stepNumber) {
    store.goToStep({ step: stepNumber });
  }
};

// Reset store when leaving the page
onUnmounted(() => {
  // Optionally reset - commented out to allow coming back
  // store.reset();
});
</script>
