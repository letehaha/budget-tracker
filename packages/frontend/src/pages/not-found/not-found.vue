<script lang="ts" setup>
import UiButton from '@/components/lib/ui/button/Button.vue';
import { ROUTES_NAMES } from '@/routes/constants';
import { ArrowLeftIcon, CompassIcon, HomeIcon } from '@lucide/vue';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const attemptedPath = computed(() => route.fullPath);

// vue-router populates history.state.back only for in-app navigations. Direct
// loads, hard refreshes, or arrivals from outside the SPA leave it null — in
// those cases there's nowhere meaningful to send the user back to.
const hasInAppHistory = computed(() => {
  const back = window.history.state?.back;
  return typeof back === 'string' && back.length > 0;
});

const goBack = () => router.back();

const goHome = () => {
  router.push({ name: ROUTES_NAMES.home });
};
</script>

<template>
  <div class="bg-background relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-12">
    <div class="not-found-glow pointer-events-none absolute inset-0 blur-3xl" aria-hidden="true" />

    <div class="pointer-events-none absolute inset-0 flex items-center justify-center select-none" aria-hidden="true">
      <span
        class="from-primary/55 via-primary/25 to-primary/0 animate-not-found-pulse bg-gradient-to-b bg-clip-text text-[clamp(14rem,40vw,28rem)] leading-none font-black tracking-tighter text-transparent"
      >
        404
      </span>
    </div>

    <div class="relative z-10 flex w-full max-w-lg flex-col items-center text-center">
      <div class="relative mb-8">
        <span
          class="bg-primary/25 absolute inset-0 -z-10 animate-ping rounded-full"
          style="animation-duration: 3s"
          aria-hidden="true"
        />
        <div
          class="from-primary/40 to-primary/5 ring-primary/30 rounded-full bg-gradient-to-br p-5 shadow-xl ring-1 backdrop-blur-sm"
        >
          <CompassIcon class="text-primary size-12" />
        </div>
      </div>

      <h1 class="text-foreground mb-3 text-3xl font-semibold tracking-tight sm:text-4xl">
        {{ $t('errors.notFound.title') }}
      </h1>
      <p class="text-muted-foreground mb-2 max-w-md text-base">
        {{ $t('errors.notFound.description') }}
      </p>

      <div
        class="border-border/60 bg-card/70 text-muted-foreground mt-2 mb-8 max-w-full rounded-md border px-3 py-1.5 text-xs backdrop-blur-sm"
      >
        <span class="opacity-70">{{ $t('errors.notFound.attemptedLabel') }}</span>
        <code class="text-foreground font-mono break-all">{{ attemptedPath }}</code>
      </div>

      <div class="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <UiButton v-if="hasInAppHistory" variant="secondary" size="lg" class="gap-2" @click="goBack">
          <ArrowLeftIcon class="size-4" />
          {{ $t('errors.notFound.goBack') }}
        </UiButton>
        <UiButton variant="default" size="lg" class="gap-2" @click="goHome">
          <HomeIcon class="size-4" />
          {{ $t('errors.notFound.goHome') }}
        </UiButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.not-found-glow {
  background: radial-gradient(ellipse at center, color-mix(in srgb, var(--primary) 22%, transparent), transparent 70%);
}

@keyframes not-found-pulse {
  0%,
  100% {
    opacity: 0.9;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.03);
  }
}

.animate-not-found-pulse {
  animation: not-found-pulse 6s ease-in-out infinite;
}
</style>
