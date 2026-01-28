<template>
  <header class="border-border/40 bg-background/80 fixed top-0 right-0 left-0 z-50 border-b backdrop-blur-xl">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div class="flex h-16 items-center justify-between">
        <!-- Logo -->
        <div class="flex items-center gap-2">
          <img src="/img/logo.svg" alt="MoneyMatter logo" class="size-8" />

          <span class="text-xl font-bold">MoneyMatter</span>
        </div>

        <!-- Navigation -->
        <nav class="hidden items-center gap-6 md:flex">
          <a href="#features" class="text-muted-foreground hover:text-foreground text-sm transition-colors">
            Features
          </a>
          <a href="#self-host" class="text-muted-foreground hover:text-foreground text-sm transition-colors">
            Self-Host
          </a>
          <a
            href="https://github.com/letehaha/budget-tracker"
            target="_blank"
            rel="noopener noreferrer"
            class="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm transition-colors"
            @click="$emit('github-click', 'header_nav')"
          >
            GitHub <ExternalLinkIcon class="size-4" />
          </a>
        </nav>

        <!-- CTAs -->
        <div class="flex items-center gap-3">
          <a
            href="https://github.com/letehaha/budget-tracker"
            target="_blank"
            rel="noopener noreferrer"
            class="border-border hover:bg-accent hidden items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors sm:flex"
            @click="$emit('github-click', 'header_star')"
          >
            <GithubCircleIcon class="size-4 text-white" />
            <span>Star on GitHub</span>
            <ExternalLinkIcon class="size-4" />
          </a>
          <router-link
            :to="{ name: ctaRoute }"
            class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            @click="$emit('cta-click', 'header')"
          >
            {{ ctaTextShort }}
          </router-link>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import GithubCircleIcon from '@/components/common/icons/github-circle.vue';
import { ExternalLinkIcon } from 'lucide-vue-next';

defineProps<{
  ctaRoute: string;
  ctaTextShort: string;
}>();

defineEmits<{
  'github-click': [location: string];
  'cta-click': [location: string];
}>();
</script>
