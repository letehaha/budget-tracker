<script setup lang="ts">
/**
 * ImportWizardStepper — numbered step header shared by the CSV and Wallet import
 * wizards. Renders one numbered circle per step with a connector between them;
 * completed steps fill in and become clickable (emit `navigate`) so the user can
 * jump back, while not-yet-reachable steps stay disabled.
 *
 * Each step's label is passed in as a localized `labelKey`, so every page owns
 * its own i18n namespace — the stepper itself holds no copy.
 *
 * Responsiveness is container-query driven: on a narrow container only the
 * current step is labelled (the row stays on one line), and at `@3xl` every step
 * reveals its label. Both wizards mark their outer element with the SAME CSS
 * container name `csv-wizard` (a shared CSS token, not CSV-specific semantics),
 * because Tailwind cannot interpolate a container name into the `@3xl/<name>`
 * variant at runtime. The variant below is bound to it literally as `@3xl/csv-wizard`.
 */
import ResponsiveTooltip from '@/components/common/responsive-tooltip.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { CheckIcon } from '@lucide/vue';

interface WizardStep {
  /** Stable identifier emitted by `navigate` and matched against `currentStepKey`. */
  key: string;
  /** i18n key resolved to the step's visible label. */
  labelKey: string;
}

defineProps<{
  steps: WizardStep[];
  currentStepKey: string;
  completedStepKeys: Set<string>;
}>();

const emit = defineEmits<{
  /** Emitted only for completed (reachable) steps, mirroring the click guard below. */
  navigate: [key: string];
}>();

function onStepClick({ step }: { step: WizardStep; completed: boolean }) {
  // Guarded by the disabled state + this check: only completed steps navigate.
  emit('navigate', step.key);
}
</script>

<template>
  <div class="bg-card rounded-xl border px-4 py-3">
    <div class="flex items-center">
      <template v-for="(step, index) in steps" :key="step.key">
        <!-- Connector before each step except the first; fills primary once the step is reached -->
        <div
          v-if="index > 0"
          class="mx-2 h-0.5 flex-1 rounded-full transition-colors duration-300"
          :class="completedStepKeys.has(step.key) || currentStepKey === step.key ? 'bg-primary' : 'bg-border'"
        />

        <!-- Step indicator: completed steps click to jump back; every step reveals its label via
             ResponsiveTooltip (hover on desktop, tap-popover on touch) since narrow rows hide labels. -->
        <ResponsiveTooltip :content="$t(step.labelKey)">
          <!-- Span wraps the trigger so the tooltip/popover still fires for disabled (non-completed)
               steps: a disabled <button> swallows pointer events, so the span must catch them. -->
          <span
            class="inline-flex shrink-0"
            :class="
              !completedStepKeys.has(step.key) && currentStepKey !== step.key ? 'cursor-not-allowed' : 'cursor-default'
            "
          >
            <UiButton
              variant="ghost"
              type="button"
              class="h-auto shrink-0 gap-2 rounded-md p-0 transition-colors"
              :disabled="!completedStepKeys.has(step.key)"
              :aria-current="currentStepKey === step.key ? 'step' : undefined"
              :aria-label="$t(step.labelKey)"
              @click="completedStepKeys.has(step.key) ? onStepClick({ step, completed: true }) : undefined"
            >
              <span
                class="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors duration-300"
                :class="
                  completedStepKeys.has(step.key) || currentStepKey === step.key
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground bg-transparent'
                "
              >
                <CheckIcon v-if="completedStepKeys.has(step.key)" class="size-3.5" />
                <span v-else>{{ index + 1 }}</span>
              </span>
              <!-- Current step always labelled; others only at @3xl, so a narrow row stays one line -->
              <span
                class="text-sm whitespace-nowrap"
                :class="
                  currentStepKey === step.key
                    ? 'text-foreground inline font-semibold'
                    : completedStepKeys.has(step.key)
                      ? 'text-foreground hidden font-medium @3xl/csv-wizard:inline'
                      : 'text-muted-foreground hidden font-medium @3xl/csv-wizard:inline'
                "
              >
                {{ $t(step.labelKey) }}
              </span>
            </UiButton>
          </span>
        </ResponsiveTooltip>
      </template>
    </div>
  </div>
</template>
