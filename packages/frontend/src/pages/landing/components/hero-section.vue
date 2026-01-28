<template>
  <section class="relative z-10 overflow-hidden py-20 sm:pt-40 sm:pb-32">
    <div class="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div class="text-center">
        <!-- Badge -->
        <div
          class="hero-fade-in border-border/60 bg-card/50 mb-8 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm backdrop-blur-sm"
          style="animation-delay: 0.1s"
        >
          <span class="size-2 animate-pulse rounded-full bg-green-500" />
          <span class="text-muted-foreground">Early Access • Open Source</span>
        </div>

        <!-- Headline -->
        <h1
          class="hero-fade-in hero-title mx-auto max-w-5xl text-3xl font-bold tracking-tight sm:text-6xl lg:text-7xl"
          style="animation-delay: 0.2s"
        >
          Your finances. Your server.
          <span class="hero-gradient-text inline-block bg-clip-text leading-tight text-transparent">
            Zero data harvesting.
          </span>
        </h1>

        <!-- Subheadline -->
        <p
          class="hero-fade-in text-muted-foreground mx-auto mt-6 max-w-2xl text-lg sm:text-xl"
          style="animation-delay: 0.35s"
        >
          Free, open-source budget tracking that respects your privacy. Self-host for complete control, or use our cloud
          — either way, your data is never sold or shared.
        </p>

        <!-- CTA Buttons -->
        <div
          class="hero-fade-in mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
          style="animation-delay: 0.45s"
        >
          <div class="flex flex-col items-center gap-2">
            <router-link
              :to="{ name: ctaRoute }"
              class="group bg-primary text-primary-foreground shadow-primary/25 hover:bg-primary/90 hover:shadow-primary/30 flex w-full items-center justify-center gap-2 rounded-xl px-8 py-3.5 text-base font-semibold shadow-lg transition-all hover:shadow-xl sm:w-auto"
              @click="$emit('cta-click', 'hero')"
            >
              {{ ctaText }}
              <ArrowRight class="size-4 transition-transform group-hover:translate-x-0.5" />
            </router-link>
            <span class="text-muted-foreground text-xs">Free and open source</span>
          </div>
          <div v-if="!isLoggedIn" class="flex flex-col items-center gap-2">
            <button
              :disabled="isDemoLoading"
              class="border-primary/50 text-primary hover:bg-primary/10 flex w-full items-center justify-center gap-2 rounded-xl border-2 px-8 py-3.5 text-base font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              @click="$emit('try-demo')"
            >
              <PlayCircle class="size-5" />
              Try Demo
            </button>
            <span class="text-muted-foreground text-xs">No signup required • Sample data</span>
          </div>
        </div>

        <!-- Early Adopter Callout -->
        <p class="hero-fade-in text-muted-foreground mt-6 text-sm" style="animation-delay: 0.55s">
          <span class="text-primary font-medium">Early adopter perk:</span>
          Shape the roadmap with your feedback
        </p>

        <!-- App Preview Placeholder -->
        <div class="hero-fade-in relative mx-auto mt-16 max-w-5xl" style="animation-delay: 0.7s">
          <div
            class="border-border/50 from-card to-card/50 relative overflow-hidden rounded-2xl border bg-linear-to-b shadow-2xl"
          >
            <!-- Browser chrome -->
            <div class="border-border/50 bg-card flex items-center gap-2 border-b px-4 py-3">
              <div class="flex gap-1.5">
                <div class="size-3 rounded-full bg-red-500/80" />
                <div class="size-3 rounded-full bg-yellow-500/80" />
                <div class="size-3 rounded-full bg-green-500/80" />
              </div>
              <div class="bg-muted text-muted-foreground ml-4 flex-1 rounded-md px-3 py-1 text-xs">
                https://moneymatter.app
              </div>
            </div>
            <!-- App screenshot -->
            <img src="/img/dashboard-desktop.png" alt="MoneyMatter dashboard" class="w-full" />
          </div>

          <!-- GitHub Activity -->
          <div class="hero-fade-in mt-8" style="animation-delay: 0.8s">
            <GitHubActivity />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ArrowRight, PlayCircle } from 'lucide-vue-next';

import GitHubActivity from './github-activity.vue';

defineProps<{
  ctaRoute: string;
  ctaText: string;
  isLoggedIn: boolean;
  isDemoLoading: boolean;
}>();

defineEmits<{
  'cta-click': [location: string];
  'try-demo': [];
}>();
</script>

<style scoped>
/* Animated gradient text */
.hero-gradient-text {
  background-image: linear-gradient(90deg, #8b5cf6 0%, #a855f7 25%, #ec4899 50%, #a855f7 75%, #8b5cf6 100%) !important;
  background-size: 200% 100% !important;
  animation: gradient-shift 2.5s ease-in-out infinite;
}

@keyframes gradient-shift {
  0%,
  100% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
}

/* Hero content slide-up animation (no opacity to avoid flash on prerendered pages) */
.hero-fade-in {
  animation: slide-up 0.8s ease-out both;
}

@keyframes slide-up {
  from {
    transform: translateY(20px);
  }
  to {
    transform: translateY(0);
  }
}
</style>
