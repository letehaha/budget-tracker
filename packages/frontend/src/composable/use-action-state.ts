import { type ComputedRef, type Ref, computed, onScopeDispose, ref } from 'vue';

type ActionState = 'idle' | 'loading' | 'success' | 'error';

const DEFAULT_FEEDBACK_DURATION = 4000;
const DEFAULT_MIN_DURATION = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface UseActionStateReturn {
  state: Ref<ActionState>;
  execute: () => Promise<void>;
  isIdle: ComputedRef<boolean>;
  isLoading: ComputedRef<boolean>;
  isSuccess: ComputedRef<boolean>;
  isError: ComputedRef<boolean>;
}

export function useActionState({
  action,
  feedbackDuration = DEFAULT_FEEDBACK_DURATION,
  minDuration = DEFAULT_MIN_DURATION,
}: {
  action: () => Promise<void>;
  feedbackDuration?: number;
  minDuration?: number;
}): UseActionStateReturn {
  const state = ref<ActionState>('idle');
  let timer: ReturnType<typeof setTimeout> | undefined;

  const execute = async () => {
    if (state.value !== 'idle') return;

    clearTimeout(timer);
    state.value = 'loading';

    try {
      await Promise.all([action(), sleep(minDuration)]);
      state.value = 'success';
    } catch {
      state.value = 'error';
    }

    timer = setTimeout(() => {
      state.value = 'idle';
    }, feedbackDuration);
  };

  onScopeDispose(() => clearTimeout(timer));

  return {
    state,
    execute,
    isIdle: computed(() => state.value === 'idle'),
    isLoading: computed(() => state.value === 'loading'),
    isSuccess: computed(() => state.value === 'success'),
    isError: computed(() => state.value === 'error'),
  };
}
