<template>
  <Teleport to="body" :disabled="!isMounted">
    <Transition name="fade">
      <div
        v-if="isVisible"
        class="bg-background/95 fixed inset-0 z-100 flex flex-col items-center justify-center backdrop-blur-sm"
      >
        <!-- Animated building blocks -->
        <div class="relative mb-8 h-24 w-32">
          <div class="building-animation flex items-end justify-center gap-1">
            <div
              v-for="i in 5"
              :key="i"
              class="bg-primary/80 w-4 rounded-t"
              :class="`block-${i}`"
              :style="{ animationDelay: `${(i - 1) * 0.15}s` }"
            />
          </div>
        </div>

        <!-- Main message -->
        <h2 class="text-foreground mb-3 text-2xl font-bold">Building your demo...</h2>

        <!-- Animated status messages -->
        <div class="text-muted-foreground h-6 text-center text-sm">
          <Transition name="slide-fade" mode="out-in">
            <span :key="currentMessage">{{ currentMessage }}</span>
          </Transition>
        </div>

        <!-- Progress dots -->
        <div class="mt-6 flex gap-2">
          <div
            v-for="i in 3"
            :key="i"
            class="bg-primary/60 size-2 rounded-full"
            :style="{
              animation: 'pulse-dot 1.4s ease-in-out infinite',
              animationDelay: `${(i - 1) * 0.2}s`,
            }"
          />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

const props = defineProps<{
  isVisible: boolean;
}>();

// Disable Teleport during SSR to avoid hydration mismatch
const isMounted = ref(false);
onMounted(() => {
  isMounted.value = true;
});

const MESSAGES = [
  'Setting up your accounts...',
  'Creating sample transactions...',
  'Configuring budgets & categories...',
  'Preparing analytics dashboard...',
  'Almost ready...',
];

const TIMEOUT_MESSAGE = 'This is taking longer than usual. Please wait...';
const MESSAGE_DURATIONS_MS = [4000, 7000, 15000, 5000];
const TIMEOUT_THRESHOLD_MS = 60_000;

const currentMessageIndex = ref(0);
const showTimeoutMessage = ref(false);
const messageTimers: ReturnType<typeof setTimeout>[] = [];
let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

const currentMessage = computed(() => {
  if (showTimeoutMessage.value) return TIMEOUT_MESSAGE;
  return MESSAGES[currentMessageIndex.value];
});

const startTimers = () => {
  let cumulativeTime = 0;

  for (let i = 0; i < MESSAGES.length - 1; i++) {
    const duration = MESSAGE_DURATIONS_MS[i] || 5000;
    cumulativeTime += duration;

    const timer = setTimeout(() => {
      if (currentMessageIndex.value < MESSAGES.length - 1) {
        currentMessageIndex.value = i + 1;
      }
    }, cumulativeTime);

    messageTimers.push(timer);
  }

  timeoutTimer = setTimeout(() => {
    showTimeoutMessage.value = true;
  }, TIMEOUT_THRESHOLD_MS);
};

const clearTimers = () => {
  messageTimers.forEach((timer) => clearTimeout(timer));
  messageTimers.length = 0;

  if (timeoutTimer) {
    clearTimeout(timeoutTimer);
    timeoutTimer = null;
  }
};

const resetState = () => {
  currentMessageIndex.value = 0;
  showTimeoutMessage.value = false;
  clearTimers();
};

watch(
  () => props.isVisible,
  (visible) => {
    if (visible) {
      resetState();
      startTimers();
    } else {
      resetState();
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  clearTimers();
});
</script>

<style scoped>
/* Building blocks animation */
.building-animation .block-1,
.building-animation .block-2,
.building-animation .block-3,
.building-animation .block-4,
.building-animation .block-5 {
  animation: build-up 2s ease-in-out infinite;
}

.building-animation .block-1 {
  height: 40px;
}
.building-animation .block-2 {
  height: 60px;
}
.building-animation .block-3 {
  height: 80px;
}
.building-animation .block-4 {
  height: 55px;
}
.building-animation .block-5 {
  height: 35px;
}

@keyframes build-up {
  0%,
  100% {
    transform: scaleY(0.3);
    opacity: 0.5;
  }
  50% {
    transform: scaleY(1);
    opacity: 1;
  }
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

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.3s ease;
}

.slide-fade-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
