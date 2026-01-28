<template>
  <section id="self-host" class="relative z-10 py-16 sm:py-24">
    <div class="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <!-- Section header -->
      <div class="mx-auto max-w-2xl text-center">
        <div
          class="mb-6 inline-flex items-center gap-2 rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 text-sm text-green-600 dark:text-green-400"
        >
          <ShieldCheck class="size-4" />
          Your data, your choice
        </div>
        <h2 class="text-2xl font-bold tracking-tight sm:text-3xl">Two ways to use MoneyMatter</h2>
        <p class="text-muted-foreground mt-4 text-lg">
          Maximum privacy with self-hosting, or quick start with our cloud. Either way, your data is never sold.
        </p>
      </div>

      <!-- Two options grid -->
      <div class="mt-12 grid gap-8 lg:grid-cols-2">
        <!-- Self-hosted option -->
        <div class="border-border/50 bg-card rounded-2xl border p-8">
          <div class="mb-4 flex items-center gap-3">
            <div class="flex size-10 items-center justify-center rounded-lg bg-green-500/10">
              <ShieldCheck class="size-5 text-green-500" />
            </div>
            <div>
              <h3 class="text-lg font-semibold">Self-Hosted</h3>
              <p class="text-muted-foreground text-sm">Your server, your data</p>
            </div>
          </div>

          <ul class="mt-6 space-y-3">
            <li class="flex items-center gap-2 text-sm">
              <Check class="text-primary size-4 shrink-0" />
              <span>We never see your data</span>
            </li>
            <li class="flex items-center gap-2 text-sm">
              <Check class="text-primary size-4 shrink-0" />
              <span>Deploy with Docker in minutes</span>
            </li>
            <li class="flex items-center gap-2 text-sm">
              <Check class="text-primary size-4 shrink-0" />
              <span>Full control over backups & updates</span>
            </li>
            <li class="flex items-center gap-2 text-sm">
              <Check class="text-primary size-4 shrink-0" />
              <span>Audit the open source code</span>
            </li>
          </ul>

          <div class="mt-6">
            <a
              href="https://github.com/letehaha/budget-tracker"
              target="_blank"
              rel="noopener noreferrer"
              class="border-border bg-card hover:bg-accent inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
              @click="$emit('github-click', 'self_host')"
            >
              <GithubCircleIcon class="size-4 text-white" />
              View Setup Guide
            </a>
          </div>
        </div>

        <!-- Cloud option -->
        <div class="border-border/50 bg-card rounded-2xl border p-8">
          <div class="mb-4 flex items-center gap-3">
            <div class="flex size-10 items-center justify-center rounded-lg bg-blue-500/10">
              <Globe class="size-5 text-blue-500" />
            </div>
            <div>
              <h3 class="text-lg font-semibold">Cloud Hosted</h3>
              <p class="text-muted-foreground text-sm">Quick start, still private</p>
            </div>
          </div>

          <ul class="mt-6 space-y-3">
            <li class="flex items-center gap-2 text-sm">
              <Check class="text-primary size-4 shrink-0" />
              <span>No setup required</span>
            </li>
            <li class="flex items-center gap-2 text-sm">
              <Check class="text-primary size-4 shrink-0" />
              <span>Data never sold or shared</span>
            </li>
            <li class="flex items-center gap-2 text-sm">
              <Check class="text-primary size-4 shrink-0" />
              <span>Export all your data anytime</span>
            </li>
            <li class="flex items-center gap-2 text-sm">
              <Check class="text-primary size-4 shrink-0" />
              <span>Switch to self-hosted whenever</span>
            </li>
          </ul>

          <div class="mt-6">
            <router-link
              :to="{ name: ctaRoute }"
              class="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              @click="$emit('cta-click', 'hero')"
            >
              Get Started Free
              <ArrowRight class="size-4" />
            </router-link>
          </div>
        </div>
      </div>

      <!-- Trust signals -->
      <div class="border-border/30 mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 border-t pt-8">
        <div class="text-muted-foreground flex items-center gap-2 text-sm">
          <Check class="text-primary size-4" />
          <span>No third-party analytics</span>
        </div>
        <div class="text-muted-foreground flex items-center gap-2 text-sm">
          <Check class="text-primary size-4" />
          <span>No ads, ever</span>
        </div>
        <div class="text-muted-foreground flex items-center gap-2 text-sm">
          <Check class="text-primary size-4" />
          <span>Open source = auditable</span>
        </div>
        <div class="text-muted-foreground flex items-center gap-2 text-sm">
          <Check class="text-primary size-4" />
          <span>Export data anytime</span>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import GithubCircleIcon from '@/components/common/icons/github-circle.vue';
import { ArrowRight, Check, Globe, ShieldCheck } from 'lucide-vue-next';

defineProps<{
  ctaRoute: string;
}>();

defineEmits<{
  'github-click': [location: string];
  'cta-click': [location: string];
}>();
</script>
