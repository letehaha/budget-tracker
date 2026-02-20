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
        <h2 class="text-foreground mb-3 text-2xl font-bold">Setting up your demo...</h2>

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
import { onMounted, ref } from 'vue';

defineProps<{
  isVisible: boolean;
}>();

// Disable Teleport during SSR to avoid hydration mismatch
const isMounted = ref(false);
onMounted(() => {
  isMounted.value = true;
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
</style>
