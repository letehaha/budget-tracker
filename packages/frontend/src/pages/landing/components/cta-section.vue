<template>
  <section class="relative z-10 py-16 sm:py-24">
    <div class="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
      <h2 class="text-2xl font-bold tracking-tight sm:text-3xl">Ready to own your financial data?</h2>
      <p class="text-muted-foreground mx-auto mt-4 max-w-xl text-lg">
        Join early adopters building better money habits without sacrificing privacy.
      </p>
      <div class="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
        <router-link
          :to="{ name: ctaRoute }"
          class="bg-primary text-primary-foreground hover:bg-primary/90 flex w-full items-center justify-center gap-2 rounded-xl px-8 py-3 font-semibold transition-all sm:w-auto"
          @click="$emit('cta-click', 'cta_section')"
        >
          {{ isLoggedIn ? 'Go to Dashboard' : 'Get Started Free' }}
          <ArrowRight class="size-4" />
        </router-link>
        <a
          href="https://github.com/letehaha/budget-tracker"
          target="_blank"
          rel="noopener noreferrer"
          class="border-border hover:bg-accent flex w-full items-center justify-center gap-2 rounded-xl border px-8 py-3 font-semibold transition-all sm:w-auto"
          @click="$emit('github-click', 'cta_section')"
        >
          <GithubCircleIcon class="size-5" />
          View on GitHub
        </a>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import GithubCircleIcon from '@/components/common/icons/github-circle.vue';
import { ArrowRight } from 'lucide-vue-next';

defineProps<{
  ctaRoute: string;
  isLoggedIn: boolean;
}>();

defineEmits<{
  'cta-click': [location: string];
  'github-click': [location: string];
}>();
</script>
