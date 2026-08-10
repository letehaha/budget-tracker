<template>
  <div
    ref="rootEl"
    class="absolute inset-0"
    @pointerenter="handlePointerEnter"
    @pointerleave="isHovered = false"
    @focusin="isFocused = true"
    @focusout="isFocused = false"
  >
    <div
      v-if="canHover"
      class="pointer-events-none absolute inset-0 transition-all duration-300"
      :class="showAffordances ? 'bg-background/60 backdrop-blur-[2px]' : 'bg-transparent'"
    />

    <!-- Corner ticks -->
    <div
      v-if="canHover"
      class="pointer-events-none absolute inset-0 transition-opacity duration-500"
      :class="showAffordances ? 'opacity-100' : 'opacity-0'"
    >
      <span class="border-primary/60 absolute top-3 left-3 size-6 rounded-tl-sm border-t-2 border-l-2" />
      <span class="border-primary/60 absolute top-3 right-3 size-6 rounded-tr-sm border-t-2 border-r-2" />
      <span class="border-primary/60 absolute bottom-3 left-3 size-6 rounded-bl-sm border-b-2 border-l-2" />
      <span class="border-primary/60 absolute right-3 bottom-3 size-6 rounded-br-sm border-r-2 border-b-2" />
    </div>

    <div
      class="absolute inset-0 flex justify-center transition-opacity duration-500"
      :class="[
        canHover ? 'items-center' : 'items-end pb-6',
        showAffordances ? 'opacity-100' : 'pointer-events-none opacity-0',
      ]"
    >
      <div class="flex flex-col items-center gap-2">
        <button
          class="bg-primary text-primary-foreground shadow-primary/25 hover:bg-primary/90 focus-visible:ring-primary/70 focus-visible:ring-offset-background flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold shadow-lg transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          @click="handleStart"
        >
          <!-- Play icon -->
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="size-4"
          >
            <polygon points="6 3 20 12 6 21 6 3" />
          </svg>
          Open live demo
        </button>
        <span class="text-muted-foreground text-xs">No signup · sample data</span>
      </div>
    </div>

    <!-- Veil -->
    <Teleport to="body" :disabled="!isMounted">
      <Transition name="veil">
        <div
          v-if="status !== 'idle'"
          class="bg-background/80 fixed inset-0 z-60 flex flex-col items-center justify-center px-6 text-center backdrop-blur-sm"
          @click="dismissError"
        >
          <template v-if="status === 'loading'">
            <p class="text-foreground text-base font-semibold">Setting up your demo account…</p>
            <p class="text-muted-foreground mt-2 text-sm">Loading sample transactions &amp; budgets</p>
            <div class="mt-6 flex gap-2">
              <div
                v-for="i in 3"
                :key="i"
                class="bg-primary/60 pulse-dot size-2 rounded-full"
                :style="{ animationDelay: `${(i - 1) * 0.2}s` }"
              />
            </div>
          </template>

          <template v-else>
            <p class="text-destructive-text max-w-sm text-sm" role="alert">{{ errorMessage }}</p>
            <button
              class="text-foreground hover:bg-muted focus-visible:ring-primary/70 focus-visible:ring-offset-background mt-4 rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              @click.stop="handleStart"
            >
              Try again
            </button>
          </template>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';

import { startDemo } from '../lib/start-demo';
import { useScrollLock } from '../lib/use-scroll-lock';

const FRAME_SELECTOR = '[data-hero-frame]';
const SECTION_SELECTOR = '[data-hero-section]';
const CROP_SELECTOR = '[data-hero-crop]';
const FADE_SELECTOR = '[data-hero-fade]';
const FRAME_ZOOM_CLASS = 'z-50';
const ZOOMED_SECTION_Z_INDEX = '50';
const ZOOM_OVERSHOOT = 1.02;
const ZOOM_DURATION_MS = 600;
const ZOOM_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';
const HOVER_QUERY = '(hover: hover) and (pointer: fine)';

const rootEl = useTemplateRef<HTMLDivElement>('rootEl');
const isMounted = ref(false);
const canHover = ref(true);
const isHovered = ref(false);
const isFocused = ref(false);
const isRevealed = computed(() => !canHover.value || isHovered.value || isFocused.value);
const status = ref<'idle' | 'loading' | 'error'>('idle');
const showAffordances = computed(() => isRevealed.value && status.value === 'idle');
const errorMessage = ref('');

const { lock: lockScroll, unlock: unlockScroll } = useScrollLock();

// Synchronous so the lock lands before `handleStart` measures the frame for the
// zoom, keeping the measurement and the animation on one layout.
watch(
  () => status.value !== 'idle',
  (isVeilVisible) => {
    if (isVeilVisible) lockScroll();
    else unlockScroll();
  },
  { flush: 'sync' },
);

let unzoomTimeout = 0;
let hoverQuery: MediaQueryList | null = null;
let cropCollapsedHeight = 0;

// Touch fires pointerenter on tap and never a matching pointerleave, which would latch hover on.
function handlePointerEnter() {
  if (!canHover.value) return;

  isHovered.value = true;
}

function handleHoverQueryChange(event: MediaQueryListEvent) {
  canHover.value = event.matches;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getFrame(): HTMLElement | null {
  return rootEl.value?.closest<HTMLElement>(FRAME_SELECTOR) ?? null;
}

function getSection(): HTMLElement | null {
  return rootEl.value?.closest<HTMLElement>(SECTION_SELECTOR) ?? null;
}

function getCrop(): HTMLElement | null {
  return rootEl.value?.closest<HTMLElement>(CROP_SELECTOR) ?? null;
}

function getFade(): HTMLElement | null {
  return getFrame()?.querySelector<HTMLElement>(FADE_SELECTOR) ?? null;
}

// The mobile crop caps the tall screenshot. Measure the frame with the cap
// lifted so the zoom targets the full image, then animate the cap open in
// sync with the frame transform.
function expandCropAndMeasure(frame: HTMLElement): DOMRect {
  const crop = getCrop();
  if (!crop) return frame.getBoundingClientRect();

  crop.style.transition = 'none';
  crop.style.maxHeight = '';
  cropCollapsedHeight = crop.getBoundingClientRect().height;
  crop.style.maxHeight = 'none';
  const expandedHeight = crop.getBoundingClientRect().height;
  const rect = frame.getBoundingClientRect();

  if (expandedHeight === cropCollapsedHeight) {
    crop.style.maxHeight = '';
    crop.style.transition = '';
    cropCollapsedHeight = 0;
    return rect;
  }

  crop.style.maxHeight = `${cropCollapsedHeight}px`;
  void crop.offsetHeight;
  crop.style.transition = `max-height ${ZOOM_DURATION_MS}ms ${ZOOM_EASING}`;
  crop.style.maxHeight = `${expandedHeight}px`;

  const fade = getFade();
  if (fade) {
    fade.style.transition = `opacity ${ZOOM_DURATION_MS}ms ${ZOOM_EASING}`;
    fade.style.opacity = '0';
  }

  return rect;
}

function collapseCrop(): void {
  if (!cropCollapsedHeight) return;

  const crop = getCrop();
  if (crop) crop.style.maxHeight = `${cropCollapsedHeight}px`;

  const fade = getFade();
  if (fade) fade.style.opacity = '';
}

function clearCropStyles(): void {
  cropCollapsedHeight = 0;

  const crop = getCrop();
  if (crop) {
    crop.style.maxHeight = '';
    crop.style.transition = '';
  }

  const fade = getFade();
  if (fade) {
    fade.style.opacity = '';
    fade.style.transition = '';
  }
}

function zoomFrame() {
  if (prefersReducedMotion()) return;

  const frame = getFrame();
  if (!frame) return;

  window.clearTimeout(unzoomTimeout);

  // The section clips its children and sits below the fixed header.
  const section = getSection();
  if (section) {
    section.style.overflow = 'visible';
    section.style.zIndex = ZOOMED_SECTION_Z_INDEX;
  }

  // Measuring with the transform cleared keeps a retry mid-unzoom accurate.
  frame.style.transition = 'none';
  frame.style.transform = '';
  const rect = expandCropAndMeasure(frame);

  const scale = Math.max(window.innerWidth / rect.width, window.innerHeight / rect.height) * ZOOM_OVERSHOOT;
  const offsetX = window.innerWidth / 2 - (rect.left + rect.width / 2);
  const offsetY = window.innerHeight / 2 - (rect.top + rect.height / 2);

  frame.classList.add(FRAME_ZOOM_CLASS);
  frame.style.transformOrigin = 'center';
  frame.style.transition = `transform ${ZOOM_DURATION_MS}ms ${ZOOM_EASING}, border-radius ${ZOOM_DURATION_MS}ms ${ZOOM_EASING}`;
  frame.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  frame.style.borderRadius = '0px';
}

function clearFrameStyles() {
  const frame = getFrame();
  if (frame) {
    frame.classList.remove(FRAME_ZOOM_CLASS);
    frame.style.transform = '';
    frame.style.borderRadius = '';
    frame.style.transition = '';
    frame.style.transformOrigin = '';
  }

  const section = getSection();
  if (section) {
    section.style.overflow = '';
    section.style.zIndex = '';
  }

  clearCropStyles();
}

function unzoomFrame() {
  const frame = getFrame();
  if (!frame) return;

  frame.style.transform = '';
  frame.style.borderRadius = '';
  collapseCrop();

  unzoomTimeout = window.setTimeout(clearFrameStyles, ZOOM_DURATION_MS);
}

function resetFrame() {
  window.clearTimeout(unzoomTimeout);
  clearFrameStyles();
}

async function handleStart() {
  if (status.value === 'loading') return;

  status.value = 'loading';
  errorMessage.value = '';
  zoomFrame();

  await startDemo({
    location: 'hero_screenshot',
    onError: ({ message }) => {
      errorMessage.value = message;
      status.value = 'error';
      unzoomFrame();
    },
  });
}

function dismissError() {
  if (status.value !== 'error') return;

  status.value = 'idle';
  errorMessage.value = '';
  unzoomFrame();
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') dismissError();
}

// A bfcache restore replays the state the page had when the demo redirected away.
function handlePageShow(event: PageTransitionEvent) {
  if (!event.persisted) return;

  status.value = 'idle';
  errorMessage.value = '';
  resetFrame();
}

onMounted(() => {
  isMounted.value = true;
  hoverQuery = window.matchMedia(HOVER_QUERY);
  canHover.value = hoverQuery.matches;
  hoverQuery.addEventListener('change', handleHoverQueryChange);
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('pageshow', handlePageShow);
});

onBeforeUnmount(() => {
  window.clearTimeout(unzoomTimeout);
  hoverQuery?.removeEventListener('change', handleHoverQueryChange);
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('pageshow', handlePageShow);
});
</script>

<style scoped>
.pulse-dot {
  animation: pulse-dot 1.4s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.6;
  }
  50% {
    transform: scale(1.3);
    opacity: 1;
  }
}

.veil-enter-active {
  transition: opacity 0.4s ease 0.2s;
}

.veil-leave-active {
  transition: opacity 0.3s ease;
}

.veil-enter-from,
.veil-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .veil-enter-active {
    transition-delay: 0ms;
  }
}
</style>
