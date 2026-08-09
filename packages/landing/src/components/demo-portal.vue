<template>
  <div
    ref="rootEl"
    class="absolute inset-0"
    @pointerenter="isHovered = true"
    @pointerleave="isHovered = false"
    @focusin="isFocused = true"
    @focusout="isFocused = false"
  >
    <div
      class="pointer-events-none absolute inset-0 transition-all duration-300"
      :class="showAffordances ? 'bg-background/60 backdrop-blur-[2px]' : 'bg-transparent'"
    />

    <!-- Corner ticks -->
    <div
      class="pointer-events-none absolute inset-0 transition-opacity duration-500"
      :class="showAffordances ? 'opacity-100' : 'opacity-0'"
    >
      <span class="border-primary/60 absolute top-3 left-3 size-6 rounded-tl-sm border-t-2 border-l-2" />
      <span class="border-primary/60 absolute top-3 right-3 size-6 rounded-tr-sm border-t-2 border-r-2" />
      <span class="border-primary/60 absolute bottom-3 left-3 size-6 rounded-bl-sm border-b-2 border-l-2" />
      <span class="border-primary/60 absolute right-3 bottom-3 size-6 rounded-br-sm border-r-2 border-b-2" />
    </div>

    <div
      class="absolute inset-0 flex flex-col items-center justify-center gap-2 transition-opacity duration-500"
      :class="showAffordances ? 'opacity-100' : 'pointer-events-none opacity-0'"
    >
      <button
        class="bg-primary text-primary-foreground shadow-primary/25 hover:bg-primary/90 focus-visible:ring-primary/70 focus-visible:ring-offset-background relative flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold shadow-lg transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
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
      <span class="text-muted-foreground relative text-xs">No signup · sample data</span>
    </div>

    <!-- Veil -->
    <Teleport to="body" :disabled="!isMounted">
      <Transition name="veil">
        <div
          v-if="status !== 'idle'"
          class="bg-background/80 fixed inset-0 z-[60] flex flex-col items-center justify-center px-6 text-center backdrop-blur-sm"
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
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue';

import { startDemo } from '../lib/start-demo';

const FRAME_SELECTOR = '[data-hero-frame]';
const SECTION_SELECTOR = '[data-hero-section]';
const FRAME_ZOOM_CLASS = 'z-50';
const ZOOMED_SECTION_Z_INDEX = '50';
const ZOOM_OVERSHOOT = 1.02;
const ZOOM_DURATION_MS = 600;
const ZOOM_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';

const rootEl = useTemplateRef<HTMLDivElement>('rootEl');
const isMounted = ref(false);
const isHovered = ref(false);
const isFocused = ref(false);
const isRevealed = computed(() => isHovered.value || isFocused.value);
const status = ref<'idle' | 'loading' | 'error'>('idle');
const showAffordances = computed(() => isRevealed.value && status.value === 'idle');
const errorMessage = ref('');

let unzoomTimeout = 0;

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getFrame(): HTMLElement | null {
  return rootEl.value?.closest<HTMLElement>(FRAME_SELECTOR) ?? null;
}

function getSection(): HTMLElement | null {
  return rootEl.value?.closest<HTMLElement>(SECTION_SELECTOR) ?? null;
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
  const rect = frame.getBoundingClientRect();

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
}

function unzoomFrame() {
  const frame = getFrame();
  if (!frame) return;

  frame.style.transform = '';
  frame.style.borderRadius = '';

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
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('pageshow', handlePageShow);
});

onBeforeUnmount(() => {
  window.clearTimeout(unzoomTimeout);
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
