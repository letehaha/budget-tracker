import { type ComputedRef, type Ref, computed, ref } from 'vue';

/**
 * Key-based wizard step machine shared by the import wizards. Owns the active
 * step key, the set of completed step keys, and forward/back navigation over the
 * currently-visible steps. The set of step keys is fixed at construction; which
 * of them are visible can vary per render via the optional `isStepVisible`
 * predicate (e.g. a conditional Resolve step), and navigation always walks the
 * visible subset so a hidden step is skipped.
 *
 * Keys are the single source of truth; any numeric step view a consumer needs is
 * derived in that consumer from its own key→number map.
 *
 * Vue-only (refs/computed); no Pinia, so it can be unit-tested in isolation.
 */
export function useWizardSteps<TStepKey extends string>({
  stepKeys,
  isStepVisible,
}: {
  /** Every step key in canonical order, before any visibility filtering. */
  stepKeys: readonly TStepKey[];
  /**
   * Optional per-key visibility predicate. Reactive sources read inside it make
   * `visibleSteps` recompute. Omit it when every step is always visible.
   */
  isStepVisible?: (key: TStepKey) => boolean;
}): {
  currentStepKey: Ref<TStepKey>;
  completedStepKeys: Ref<Set<TStepKey>>;
  visibleSteps: ComputedRef<{ key: TStepKey }[]>;
  goToStep: (key: TStepKey) => void;
  goNext: () => void;
  goBack: () => void;
  markStepCompleted: (key: TStepKey) => void;
  reset: () => void;
} {
  // Callers always pass a non-empty ordered list; the first key is the initial step.
  const firstStepKey = stepKeys[0] as TStepKey;

  const currentStepKey = ref(firstStepKey) as Ref<TStepKey>;
  const completedStepKeys = ref(new Set<TStepKey>()) as Ref<Set<TStepKey>>;

  /** Ordered list of steps to render, filtered by `isStepVisible` when given. */
  const visibleSteps = computed<{ key: TStepKey }[]>(() =>
    stepKeys.filter((key) => (isStepVisible ? isStepVisible(key) : true)).map((key) => ({ key })),
  );

  /** Sets the active step by key. */
  const goToStep = (key: TStepKey): void => {
    currentStepKey.value = key;
  };

  /** Marks a step complete in the key set. */
  const markStepCompleted = (key: TStepKey): void => {
    completedStepKeys.value.add(key);
  };

  /** Advances to the next visible step, marking the current one complete. */
  const goNext = (): void => {
    const steps = visibleSteps.value;
    const index = steps.findIndex((s) => s.key === currentStepKey.value);
    if (index === -1) return;
    markStepCompleted(currentStepKey.value);
    const next = steps[index + 1];
    if (next) goToStep(next.key);
  };

  /** Walks back to the previous visible step. */
  const goBack = (): void => {
    const steps = visibleSteps.value;
    const index = steps.findIndex((s) => s.key === currentStepKey.value);
    if (index <= 0) return;
    const prev = steps[index - 1];
    if (prev) goToStep(prev.key);
  };

  /** Returns the machine to its initial state (first step, nothing completed). */
  const reset = (): void => {
    currentStepKey.value = firstStepKey;
    completedStepKeys.value = new Set<TStepKey>();
  };

  return {
    currentStepKey,
    completedStepKeys,
    visibleSteps,
    goToStep,
    goNext,
    goBack,
    markStepCompleted,
    reset,
  };
}
