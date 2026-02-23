<!--
  ActionButton — a button that manages an async action's full lifecycle:
  idle → loading → success/error → idle, with vertical slide transitions.

  ## Width stability

  Different states have different label widths (e.g. "Archive" vs "Loading...").
  To prevent the button from jumping between sizes:

  1. A hidden copy of the loading content is always rendered (invisible, absolute).
     On mount we measure it to get `loadingMinWidth` — the width the button needs
     for the loading/done/failed states.

  2. On click, `lockedMinWidth` is set to `loadingMinWidth`. The button's inline
     `min-width` style + CSS transition smoothly grows the button to that size.
     This value is held for loading, success, AND error states, so they never jump.

  3. When returning to idle, the `@after-enter` transition hook fires after the new
     idle label has fully slid in. At that point we measure the idle content's
     natural width and set `lockedMinWidth` to it — CSS transitions the button
     smoothly to the new size. After the transition completes we clear
     `lockedMinWidth` so the button can size freely again.
-->
<script setup lang="ts">
import { useActionState } from '@/composable/use-action-state';
import { CheckIcon, Loader2Icon, XIcon } from 'lucide-vue-next';
import {
  type Component,
  type ComponentPublicInstance,
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';
import { useI18n } from 'vue-i18n';

import type { ButtonVariantProps } from '../button';
import Button from '../button/Button.vue';

const props = withDefaults(
  defineProps<{
    action: () => Promise<void>;

    // Idle
    label?: string;
    icon?: Component;
    variant?: ButtonVariantProps['variant'];
    size?: ButtonVariantProps['size'];

    // Loading
    loadingLabel?: string;

    // Success (feedback)
    successLabel?: string;
    successVariant?: ButtonVariantProps['variant'];

    // Error (feedback)
    errorLabel?: string;
    errorVariant?: ButtonVariantProps['variant'];

    feedbackDuration?: number;
    minDuration?: number;
    disabled?: boolean;
  }>(),
  {
    variant: 'outline',
    successVariant: 'outline-success',
    errorVariant: 'soft-destructive',
    feedbackDuration: 2000,
    minDuration: 1000,
  },
);

const emit = defineEmits<{
  success: [];
  error: [error: unknown];
}>();

const { t } = useI18n();

const displayLoadingLabel = computed(() => props.loadingLabel ?? t('common.actions.loading'));
const displaySuccessLabel = computed(() => props.successLabel ?? t('common.actions.done'));
const displayErrorLabel = computed(() => props.errorLabel ?? t('common.actions.failed'));

// --- Width stability ---

const buttonRef = ref<ComponentPublicInstance | null>(null);
const hiddenLoadingRef = ref<HTMLElement | null>(null);
/**
 * Active min-width lock applied to the button via inline style.
 * Set to `loadingMinWidth` on click, then transitioned to the idle label's
 * natural width on @after-enter, then cleared after the CSS transition.
 */
const lockedMinWidth = ref<string | undefined>(undefined);
/**
 * Pre-measured width of the loading state (icon + label + button padding/border).
 * Calculated from the loading label because it is the longest across all translations.
 */
const loadingMinWidth = ref<string | undefined>(undefined);

/** Returns the button element's horizontal padding + border in pixels. */
function getButtonChrome(): number {
  const buttonEl = buttonRef.value?.$el as HTMLElement | undefined;
  if (!buttonEl) return 0;

  const style = getComputedStyle(buttonEl);
  return (
    parseFloat(style.paddingLeft) +
    parseFloat(style.paddingRight) +
    parseFloat(style.borderLeftWidth) +
    parseFloat(style.borderRightWidth)
  );
}

function measureLoadingWidth(): void {
  const spanEl = hiddenLoadingRef.value;
  if (!spanEl || !buttonRef.value) return;

  loadingMinWidth.value = `${spanEl.offsetWidth + getButtonChrome()}px`;
}

onMounted(measureLoadingWidth);

// Re-measure when the loading label changes (e.g. locale switch)
watch(displayLoadingLabel, async () => {
  await nextTick();
  measureLoadingWidth();
});

const { state, execute, isIdle, isLoading, isSuccess, isError } = useActionState({
  action: async () => {
    // Lock button width to the pre-measured loading width so it doesn't jump
    lockedMinWidth.value = loadingMinWidth.value;

    try {
      await props.action();
      emit('success');
    } catch (e) {
      emit('error', e);
      throw e;
    }
  },
  feedbackDuration: props.feedbackDuration,
  minDuration: props.minDuration,
});

const resolvedVariant = computed(() => {
  if (state.value === 'success') return props.successVariant;
  if (state.value === 'error') return props.errorVariant;
  return props.variant;
});

/** Must match the button's CSS transition duration for min-width. */
const WIDTH_TRANSITION_MS = 300;
let widthTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Called after the entering span's slide transition completes.
 * When the idle label has fully appeared, we transition `lockedMinWidth`
 * to the idle content's natural width, then clear it once the CSS
 * min-width transition finishes.
 */
function onAfterEnter(el: Element): void {
  if (state.value !== 'idle') return;
  if (!buttonRef.value) return;

  lockedMinWidth.value = `${(el as HTMLElement).offsetWidth + getButtonChrome()}px`;

  // Clear after the min-width CSS transition so the button can size freely
  clearTimeout(widthTimer);
  widthTimer = setTimeout(() => {
    lockedMinWidth.value = undefined;
  }, WIDTH_TRANSITION_MS + 50);
}

onBeforeUnmount(() => clearTimeout(widthTimer));
</script>

<template>
  <Button
    ref="buttonRef"
    :variant="resolvedVariant"
    :size="size"
    :disabled="disabled"
    :aria-disabled="!isIdle || undefined"
    :style="lockedMinWidth ? { minWidth: lockedMinWidth } : undefined"
    :class="[
      'overflow-hidden transition-[color,background-color,border-color,min-width] duration-300',
      !isIdle && 'pointer-events-none',
    ]"
    @click="execute"
  >
    <!--
      Hidden duplicate of the loading content, always rendered so we can
      measure its width on mount. Invisible + absolute so it doesn't
      affect layout or be clickable.
    -->
    <span ref="hiddenLoadingRef" class="pointer-events-none invisible absolute inline-flex items-center gap-2">
      <Loader2Icon class="size-4" />
      {{ displayLoadingLabel }}
    </span>

    <!-- Visible content with vertical slide transition between states -->
    <Transition name="action-btn" mode="out-in" @after-enter="onAfterEnter">
      <span v-if="isIdle" key="idle" class="inline-flex items-center gap-2">
        <component :is="icon" v-if="icon" class="size-4" />
        <template v-if="label">{{ label }}</template>
      </span>
      <span v-else-if="isLoading" key="loading" class="inline-flex items-center gap-2">
        <Loader2Icon class="size-4 animate-spin" />
        {{ displayLoadingLabel }}
      </span>
      <span v-else-if="isSuccess" key="success" class="inline-flex items-center gap-2">
        <CheckIcon class="animate-archive-check size-4" />
        {{ displaySuccessLabel }}
      </span>
      <span v-else-if="isError" key="error" class="inline-flex items-center gap-2">
        <XIcon class="animate-archive-check size-4" />
        {{ displayErrorLabel }}
      </span>
    </Transition>
  </Button>
</template>

<!-- Vertical slide: old content slides down and out, new content slides in from top -->
<style scoped>
.action-btn-enter-active,
.action-btn-leave-active {
  transition:
    transform 0.1s ease,
    opacity 0.075s ease;
}

.action-btn-enter-from {
  transform: translateY(-100%);
  opacity: 0;
}

.action-btn-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>
