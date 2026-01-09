<template>
  <div class="landing-page bg-background text-foreground min-h-screen">
    <!-- Global animated background orbs -->
    <div class="orbs-container pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <!-- Noise texture overlay to reduce gradient banding -->
      <svg class="absolute inset-0 z-10 size-full opacity-[0.05] mix-blend-overlay" xmlns="http://www.w3.org/2000/svg">
        <filter id="noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="4" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#noise)" />
      </svg>

      <!-- Hero area orbs -->
      <div
        class="hero-orb hero-orb-1 absolute -top-[10%] left-1/2 size-[800px] -translate-x-1/2 rounded-full bg-gradient-to-br from-purple-500/20 via-purple-500/10 to-transparent"
      />
      <div
        class="hero-orb hero-orb-2 absolute top-[15%] right-0 size-[600px] translate-x-1/3 rounded-full bg-gradient-to-bl from-blue-500/15 via-cyan-500/10 to-transparent"
      />
      <!-- Features area orbs -->
      <div
        class="hero-orb hero-orb-3 absolute top-[40%] -left-[10%] size-[500px] rounded-full bg-gradient-to-tr from-pink-500/15 via-purple-500/10 to-transparent"
      />
      <!-- Self-host area orbs -->
      <div
        class="hero-orb hero-orb-1 absolute top-[55%] -right-[5%] size-[450px] rounded-full bg-gradient-to-bl from-green-500/15 via-emerald-500/10 to-transparent"
      />
      <!-- CTA/Footer area orbs -->
      <div
        class="hero-orb hero-orb-2 absolute top-[75%] left-[10%] size-[500px] rounded-full bg-gradient-to-tr from-purple-500/15 via-pink-500/10 to-transparent"
      />
      <div
        class="hero-orb hero-orb-3 absolute top-[85%] right-[5%] size-[400px] rounded-full bg-gradient-to-tl from-pink-500/15 via-purple-500/10 to-transparent"
      />
    </div>

    <!-- Header -->
    <header class="border-border/40 bg-background/80 fixed top-0 right-0 left-0 z-50 border-b backdrop-blur-xl">
      <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div class="flex h-16 items-center justify-between">
          <!-- Logo -->
          <div class="flex items-center gap-2">
            <img src="/img/logo.svg" class="size-8" />

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
              @click="trackGitHubClick('header_nav')"
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
              @click="trackGitHubClick('header_star')"
            >
              <GithubCircleIcon class="size-4 text-white" />
              <span>Star on GitHub</span>
              <ExternalLinkIcon class="size-4" />
            </a>
            <router-link
              :to="{ name: ctaRoute }"
              class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              @click="trackCtaClick('header')"
            >
              {{ ctaTextShort }}
            </router-link>
          </div>
        </div>
      </div>
    </header>

    <!-- Hero Section -->
    <section class="relative z-10 overflow-hidden py-20 sm:pt-40 sm:pb-32">
      <div class="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div class="text-center">
          <!-- Badge -->
          <div
            class="hero-fade-in border-border/60 bg-card/50 mb-8 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm backdrop-blur-sm"
            style="animation-delay: 0.1s"
          >
            <span class="size-2 animate-pulse rounded-full bg-green-500" />
            <span class="text-muted-foreground">Open source & self-hostable</span>
          </div>

          <!-- Headline -->
          <h1
            class="hero-fade-in hero-title mx-auto max-w-4xl text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl"
            style="animation-delay: 0.2s"
          >
            Take control of your
            <span class="hero-gradient-text inline-block bg-clip-text text-transparent"> financial future </span>
          </h1>

          <p
            class="hero-fade-in mt-6 text-xl font-medium tracking-wide text-white/90 sm:text-2xl"
            style="text-shadow: 0 0 40px rgba(168, 85, 247, 0.4); animation-delay: 0.35s"
          >
            Your money. Your data.
            <span
              class="hero-gradient-text-secondary from-primary inline-block bg-gradient-to-r via-purple-500 to-pink-500 bg-clip-text whitespace-nowrap text-transparent"
            >
              It matters.
            </span>
          </p>

          <!-- Subheadline -->
          <p
            class="hero-fade-in text-muted-foreground mx-auto mt-6 max-w-2xl text-lg sm:text-xl"
            style="animation-delay: 0.45s"
          >
            Track expenses, connect your banks, set budgets, and own your data. MoneyMatter is the personal finance app
            that puts you in charge.
          </p>

          <!-- CTA Buttons -->
          <div
            class="hero-fade-in mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
            style="animation-delay: 0.55s"
          >
            <router-link
              :to="{ name: ctaRoute }"
              class="group bg-primary text-primary-foreground shadow-primary/25 hover:bg-primary/90 hover:shadow-primary/30 flex w-full items-center justify-center gap-2 rounded-xl px-8 py-3.5 text-base font-semibold shadow-lg transition-all hover:shadow-xl sm:w-auto"
              @click="trackCtaClick('hero')"
            >
              {{ ctaText }}
              <ArrowRight class="size-4 transition-transform group-hover:translate-x-0.5" />
            </router-link>
            <a
              href="https://github.com/letehaha/budget-tracker"
              target="_blank"
              rel="noopener noreferrer"
              class="border-border bg-card hover:bg-accent flex w-full items-center justify-center gap-2 rounded-xl border px-8 py-3.5 text-base font-semibold transition-all sm:w-auto"
              @click="trackGitHubClick('hero')"
            >
              <GithubCircleIcon class="size-5 text-white" />
              View on GitHub <ExternalLinkIcon class="size-4" />
            </a>
          </div>

          <!-- App Preview Placeholder -->
          <div class="hero-fade-in relative mx-auto mt-16 max-w-5xl" style="animation-delay: 0.7s">
            <div
              class="border-border/50 from-card to-card/50 relative overflow-hidden rounded-2xl border bg-gradient-to-b shadow-2xl"
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
          </div>
        </div>
      </div>
    </section>

    <!-- Features Section -->
    <section id="features" class="relative z-10 py-16 sm:py-32">
      <div class="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <!-- Section header -->
        <div class="mx-auto max-w-2xl text-center">
          <h2 class="text-2xl font-bold tracking-tight sm:text-4xl">
            Everything you need to <br />
            manage your money
          </h2>
          <p class="text-muted-foreground mt-4 text-lg">
            Powerful features designed to give you complete control and visibility over your finances.
          </p>
        </div>

        <!-- Features grid -->
        <div class="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          <!-- Bank Connections -->
          <div
            class="group border-border/50 bg-card hover:border-primary/50 relative overflow-hidden rounded-2xl border p-6 transition-all hover:shadow-lg"
          >
            <div
              class="mb-4 flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/10 to-blue-600/10 text-blue-500"
            >
              <Landmark class="size-6" />
            </div>
            <h3 class="mb-2 text-lg font-semibold">
              Bank Connections

              <span
                class="ml-1 rounded bg-amber-500/20 px-1.5 py-0.5 align-middle text-xs font-medium text-amber-600 dark:text-amber-400"
              >
                Beta
              </span>
            </h3>
            <p class="text-muted-foreground text-sm">
              Connect your bank accounts securely and sync transactions automatically. No more manual entry.
            </p>
          </div>

          <!-- Custom Categories -->
          <div
            class="group border-border/50 bg-card hover:border-primary/50 relative overflow-hidden rounded-2xl border p-6 transition-all hover:shadow-lg"
          >
            <div
              class="mb-4 flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500/10 to-purple-600/10 text-purple-500"
            >
              <Tag class="size-6" />
            </div>
            <h3 class="mb-2 text-lg font-semibold">Custom Categories</h3>
            <p class="text-muted-foreground text-sm">
              Create your own categories that match how you think about spending. Organize your way.
            </p>
          </div>

          <!-- Auto Categorization -->
          <div
            class="group border-border/50 bg-card hover:border-primary/50 relative overflow-hidden rounded-2xl border p-6 transition-all hover:shadow-lg"
          >
            <div
              class="mb-4 flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-green-500/10 to-green-600/10 text-green-500"
            >
              <Lightbulb class="size-6" />
            </div>
            <h3 class="mb-2 text-lg font-semibold">Smart Categorization</h3>
            <p class="text-muted-foreground text-sm">
              AI-powered automatic categorization learns from your habits and saves you time.
            </p>
          </div>

          <!-- Budgeting -->
          <div
            class="group border-border/50 bg-card hover:border-primary/50 relative overflow-hidden rounded-2xl border p-6 transition-all hover:shadow-lg"
          >
            <div
              class="mb-4 flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500/10 to-orange-600/10 text-orange-500"
            >
              <BarChart3 class="size-6" />
            </div>
            <h3 class="mb-2 text-lg font-semibold">Budgeting</h3>
            <p class="text-muted-foreground text-sm">
              Set budgets for categories and track your progress. Stay on top of your spending goals.
            </p>
          </div>

          <!-- Import Transactions -->
          <div
            class="group border-border/50 bg-card hover:border-primary/50 relative overflow-hidden rounded-2xl border p-6 transition-all hover:shadow-lg"
          >
            <div
              class="mb-4 flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/10 to-cyan-600/10 text-cyan-500"
            >
              <Upload class="size-6" />
            </div>
            <h3 class="mb-2 text-lg font-semibold">Import Transactions</h3>
            <p class="text-muted-foreground text-sm">
              Import transactions from CSV files. Bring your historical data from any source.
            </p>
          </div>

          <!-- Transfers -->
          <div
            class="group border-border/50 bg-card hover:border-primary/50 relative overflow-hidden rounded-2xl border p-6 transition-all hover:shadow-lg"
          >
            <div
              class="mb-4 flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500/10 to-pink-600/10 text-pink-500"
            >
              <ArrowLeftRight class="size-6" />
            </div>
            <h3 class="mb-2 text-lg font-semibold">Account Transfers</h3>
            <p class="text-muted-foreground text-sm">
              Track transfers between accounts seamlessly. Keep accurate balances across all accounts.
            </p>
          </div>

          <!-- Portfolio Tracking -->
          <div
            class="group border-border/50 bg-card hover:border-primary/50 relative overflow-hidden rounded-2xl border p-6 transition-all hover:shadow-lg"
          >
            <div
              class="mb-4 flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-600/10 text-emerald-500"
            >
              <TrendingUp class="size-6" />
            </div>
            <h3 class="mb-2 text-lg font-semibold">
              Portfolio Tracking
              <span
                class="ml-1 rounded bg-amber-500/20 px-1.5 py-0.5 align-middle text-xs font-medium text-amber-600 dark:text-amber-400"
              >
                Beta
              </span>
            </h3>
            <p class="text-muted-foreground text-sm">
              Monitor your stocks and investments. Track performance, gains, and portfolio allocation in real-time.
            </p>
          </div>

          <!-- Multi-Currency -->
          <div
            class="group border-border/50 bg-card hover:border-primary/50 relative overflow-hidden rounded-2xl border p-6 transition-all hover:shadow-lg"
          >
            <div
              class="mb-4 flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/10 to-indigo-600/10 text-indigo-500"
            >
              <Globe class="size-6" />
            </div>
            <h3 class="mb-2 text-lg font-semibold">Multi-Currency</h3>
            <p class="text-muted-foreground text-sm">
              Manage accounts in different currencies. Automatic exchange rates keep your totals accurate.
            </p>
          </div>

          <!-- And many more -->
          <div
            class="group border-border/50 bg-card hover:border-primary/50 relative overflow-hidden rounded-2xl border p-6 transition-all hover:shadow-lg"
          >
            <div
              class="mb-4 flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/10 to-violet-600/10 text-violet-500"
            >
              <Sparkles class="size-6" />
            </div>
            <h3 class="mb-2 text-lg font-semibold">And Many More</h3>
            <p class="text-muted-foreground text-sm">
              Refunds tracking, transaction linking, hidden categories, account groups, custom exchange rates, transfers
              out of wallet, and more.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Self-Host Section -->
    <section id="self-host" class="relative z-10 py-16 sm:py-32">
      <div class="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div class="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <!-- Content -->
          <div>
            <div
              class="mb-6 inline-flex items-center gap-2 rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 text-sm text-green-600 dark:text-green-400"
            >
              <ShieldCheck class="size-4" />
              Your data, your control
            </div>
            <h2 class="text-2xl font-bold tracking-tight sm:text-4xl">Self-host for complete privacy</h2>
            <p class="text-muted-foreground mt-4 text-lg">
              Run MoneyMatter on your own server. Your financial data never leaves your infrastructure. No
              subscriptions, no data collection, no third-party access.
            </p>

            <ul class="mt-8 space-y-4">
              <li class="flex items-start gap-3">
                <div class="bg-primary/10 mt-1 flex size-5 shrink-0 items-center justify-center rounded-full">
                  <Check class="text-primary size-3" :stroke-width="3" />
                </div>
                <div>
                  <p class="font-medium">100% Data Ownership</p>
                  <p class="text-muted-foreground text-sm">Your data is stored on your servers only</p>
                </div>
              </li>
              <li class="flex items-start gap-3">
                <div class="bg-primary/10 mt-1 flex size-5 shrink-0 items-center justify-center rounded-full">
                  <Check class="text-primary size-3" :stroke-width="3" />
                </div>
                <div>
                  <p class="font-medium">Docker Ready</p>
                  <p class="text-muted-foreground text-sm">Deploy in minutes with Docker Compose</p>
                </div>
              </li>
              <li class="flex items-start gap-3">
                <div class="bg-primary/10 mt-1 flex size-5 shrink-0 items-center justify-center rounded-full">
                  <Check class="text-primary size-3" :stroke-width="3" />
                </div>
                <div>
                  <p class="font-medium">Open Source</p>
                  <p class="text-muted-foreground text-sm">Audit the code, contribute, make it yours</p>
                </div>
              </li>
            </ul>

            <div class="mt-10">
              <a
                href="https://github.com/letehaha/budget-tracker"
                target="_blank"
                rel="noopener noreferrer"
                class="border-border bg-card hover:bg-accent inline-flex items-center gap-2 rounded-lg border px-5 py-2.5 font-medium transition-colors"
                @click="trackGitHubClick('self_host')"
              >
                <GithubCircleIcon class="size-5 text-white" />
                View Setup Guide
              </a>
            </div>
          </div>

          <!-- Visual -->
          <div class="relative">
            <div class="border-border/50 bg-card overflow-hidden rounded-2xl border shadow-xl">
              <!-- Terminal header -->
              <div class="border-border/50 bg-muted/50 flex items-center gap-2 border-b px-4 py-3">
                <div class="flex gap-1.5">
                  <div class="size-3 rounded-full bg-red-500/80" />
                  <div class="size-3 rounded-full bg-yellow-500/80" />
                  <div class="size-3 rounded-full bg-green-500/80" />
                </div>
                <span class="text-muted-foreground ml-2 text-xs">terminal</span>
              </div>
              <!-- Terminal content -->
              <div class="bg-[#0d1117] p-6 font-mono text-sm">
                <div class="space-y-2">
                  <p>
                    <span class="text-green-400">$</span>
                    <span class="text-gray-300"> git clone https://github.com/letehaha/budget-tracker</span>
                  </p>
                  <p>
                    <span class="text-green-400">$</span>
                    <span class="text-gray-300"> cd budget-tracker</span>
                  </p>
                  <p>
                    <span class="text-green-400">$</span>
                    <span class="text-gray-300"> docker-compose up -d</span>
                  </p>
                  <p class="mt-4 text-gray-500"># Your MoneyMatter instance is now running!</p>
                  <p class="text-gray-500"># Visit https://localhost:8100</p>
                </div>
              </div>
            </div>
            <p class="text-muted-foreground mt-4 text-center text-sm">
              <a
                href="https://github.com/letehaha/budget-tracker/blob/main/docs/application-setup.md"
                target="_blank"
                rel="noopener noreferrer"
                class="hover:text-foreground inline-flex items-center gap-1 underline underline-offset-4 transition-colors"
              >
                See full setup guide
                <ExternalLinkIcon class="size-3" />
              </a>
              for environment configuration and detailed instructions.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA Section -->
    <section class="relative z-10 py-16 sm:py-32">
      <div class="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div
          class="from-primary relative overflow-hidden rounded-3xl bg-gradient-to-br via-purple-600 to-pink-600 px-6 py-12 text-center sm:px-16 sm:py-24"
        >
          <!-- Background pattern -->
          <div class="pointer-events-none absolute inset-0 opacity-30">
            <svg class="size-full" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" stroke-width="0.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
          </div>

          <div class="relative">
            <h2 class="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">Ready to take control?</h2>
            <p class="mx-auto mt-4 max-w-xl text-lg text-white/80">
              Start managing your finances with MoneyMatter today. It's free, open source, and built for privacy.
            </p>
            <div class="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <router-link
                :to="{ name: ctaRoute }"
                class="text-primary flex w-full items-center justify-center gap-2 rounded-xl bg-white px-8 py-3.5 font-semibold shadow-lg transition-all hover:bg-white/90 sm:w-auto"
                @click="trackCtaClick('cta_section')"
              >
                {{ isLoggedIn ? 'Go to Dashboard' : 'Get Started Free' }}
                <ArrowRight class="size-4" />
              </router-link>
              <a
                href="https://github.com/letehaha/budget-tracker"
                target="_blank"
                rel="noopener noreferrer"
                class="flex w-full items-center justify-center gap-2 rounded-xl border border-white/30 px-8 py-3.5 font-semibold text-white transition-all hover:bg-white/10 sm:w-auto"
                @click="trackGitHubClick('cta_section')"
              >
                <GithubCircleIcon class="size-5 text-white" />
                View on GitHub
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="border-border/40 relative overflow-hidden border-t py-12">
      <!-- Background gradient -->
      <div class="pointer-events-none absolute inset-0">
        <div
          class="hero-orb hero-orb-1 absolute -bottom-1/2 left-1/2 size-[600px] -translate-x-1/2 rounded-full bg-gradient-to-t from-purple-500/5 via-pink-500/5 to-transparent blur-3xl"
        />
      </div>

      <div class="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div class="flex flex-col flex-wrap items-center justify-between gap-6 sm:flex-row">
          <div class="flex w-full items-center justify-between gap-6 max-sm:flex-col">
            <!-- Logo -->
            <div class="flex items-center gap-2">
              <div
                class="from-primary flex size-8 items-center justify-center rounded-lg bg-gradient-to-br to-purple-600"
              >
                <CircleDollarSign class="size-5 text-white" :stroke-width="2" />
              </div>
              <span class="font-semibold">MoneyMatter</span>
            </div>

            <!-- Links -->
            <div class="text-muted-foreground flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
              <a
                href="https://github.com/letehaha/budget-tracker"
                target="_blank"
                rel="noopener noreferrer"
                class="hover:text-foreground transition-colors"
                @click="trackGitHubClick('footer')"
              >
                GitHub
              </a>
              <template v-if="isLoggedIn">
                <router-link :to="{ name: ROUTES_NAMES.home }" class="hover:text-foreground transition-colors">
                  Dashboard
                </router-link>
              </template>
              <template v-else>
                <router-link :to="{ name: ROUTES_NAMES.signIn }" class="hover:text-foreground transition-colors">
                  Sign In
                </router-link>
                <router-link :to="{ name: ROUTES_NAMES.signUp }" class="hover:text-foreground transition-colors">
                  Sign Up
                </router-link>
              </template>
              <router-link :to="{ name: ROUTES_NAMES.privacyPolicy }" class="hover:text-foreground transition-colors">
                Privacy Policy
              </router-link>
              <router-link :to="{ name: ROUTES_NAMES.termsOfUse }" class="hover:text-foreground transition-colors">
                Terms of Use
              </router-link>
            </div>
          </div>

          <!-- Copyright -->
          <p class="text-muted-foreground mx-auto text-sm">
            &copy; {{ currentYear }} MoneyMatter. Open source under CC BY-NC-SA 4.0.
          </p>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import GithubCircleIcon from '@/components/common/icons/github-circle.vue';
import { trackAnalyticsEvent } from '@/lib/posthog';
import { ROUTES_NAMES } from '@/routes';
import { useAuthStore } from '@/stores';
import { useHead } from '@unhead/vue';
import {
  ArrowLeftRight,
  ArrowRight,
  BarChart3,
  Check,
  CircleDollarSign,
  ExternalLinkIcon,
  Globe,
  Landmark,
  Lightbulb,
  ShieldCheck,
  Sparkles,
  Tag,
  TrendingUp,
  Upload,
} from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, onMounted, onUnmounted } from 'vue';

const authStore = useAuthStore();
const { isLoggedIn } = storeToRefs(authStore);
const { isReturningUser } = authStore;

// Validate session on landing page to check if stored token is still valid
onMounted(async () => {
  const token = localStorage.getItem('user-token');
  if (token && !isLoggedIn.value) {
    await authStore.validateSession();
  }
});

const ctaRoute = computed(() => {
  if (isLoggedIn.value) return ROUTES_NAMES.home;
  return isReturningUser ? ROUTES_NAMES.signIn : ROUTES_NAMES.signUp;
});
const ctaText = computed(() => {
  if (isLoggedIn.value) return 'Go to Dashboard';
  return isReturningUser ? 'Sign in' : 'Start for free';
});
const ctaTextShort = computed(() => {
  if (isLoggedIn.value) return 'Dashboard';
  return isReturningUser ? 'Sign in' : 'Get Started';
});

// Analytics tracking
const trackGitHubClick = (
  location: 'header_nav' | 'header_star' | 'hero' | 'self_host' | 'cta_section' | 'footer',
) => {
  trackAnalyticsEvent({
    event: 'landing_github_clicked',
    properties: { location },
  });
};

const trackCtaClick = (location: 'header' | 'hero' | 'cta_section') => {
  const action = isLoggedIn.value ? 'go_to_dashboard' : isReturningUser ? 'sign_in' : 'sign_up';
  trackAnalyticsEvent({
    event: 'landing_cta_clicked',
    properties: { location, action },
  });
};

const siteUrl = 'https://moneymatter.app';
const pageTitle = 'MoneyMatter - Take Control of Your Financial Future';
const pageDescription =
  'Track expenses, connect your banks, set budgets, and own your data. MoneyMatter is the open-source personal finance app that puts you in charge.';
const ogImage = `${siteUrl}/img/og-image.png`;

useHead({
  title: pageTitle,
  meta: [
    { name: 'description', content: pageDescription },
    // Open Graph
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: siteUrl },
    { property: 'og:title', content: pageTitle },
    { property: 'og:description', content: pageDescription },
    { property: 'og:image', content: ogImage },
    { property: 'og:site_name', content: 'MoneyMatter' },
    // Twitter Card
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:url', content: siteUrl },
    { name: 'twitter:title', content: pageTitle },
    { name: 'twitter:description', content: pageDescription },
    { name: 'twitter:image', content: ogImage },
  ],
  link: [{ rel: 'canonical', href: siteUrl }],
});

const currentYear = computed(() => new Date().getFullYear());

// Override global overflow:hidden for landing page scrolling
onMounted(() => {
  document.documentElement.style.overflow = 'auto';
  document.body.style.overflow = 'auto';
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
});

onUnmounted(() => {
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
});
</script>

<style scoped>
.landing-page {
  font-family: 'Montserrat', system-ui, sans-serif;
  overflow-y: auto;
}

/* Floating orb animations */
.hero-orb {
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
  /* Reduce banding artifacts on Retina displays */
  will-change: transform, opacity;
  transform: translateZ(0);
  backface-visibility: hidden;
  filter: blur(80px); /* Override blur-3xl (64px) with smoother blur */
}

.hero-orb-1 {
  animation:
    float-1 12s infinite,
    pulse 4s ease-in-out infinite;
}

.hero-orb-2 {
  animation:
    float-2 15s infinite,
    pulse 5s ease-in-out infinite 1s;
}

.hero-orb-3 {
  animation:
    float-3 13s infinite,
    pulse 6s ease-in-out infinite 2s;
}

@keyframes float-1 {
  0%,
  100% {
    transform: translate(0, 0);
  }
  33% {
    transform: translate(3%, 4%);
  }
  66% {
    transform: translate(-2%, -2%);
  }
}

@keyframes float-2 {
  0%,
  100% {
    transform: translate(0, 0);
  }
  50% {
    transform: translate(-4%, 3%);
  }
}

@keyframes float-3 {
  0%,
  100% {
    transform: translate(0, 0);
  }
  40% {
    transform: translate(5%, -3%);
  }
  70% {
    transform: translate(-3%, 2%);
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.5;
    scale: 1;
  }
  50% {
    opacity: 0.8;
    scale: 1.15;
  }
}

/* Animated gradient text */
.hero-gradient-text {
  background-image: linear-gradient(90deg, #8b5cf6 0%, #a855f7 25%, #ec4899 50%, #a855f7 75%, #8b5cf6 100%) !important;
  background-size: 200% 100% !important;
  animation: gradient-shift 2.5s ease-in-out infinite;
}

.hero-gradient-text-secondary {
  background-image: linear-gradient(90deg, #8b5cf6 0%, #a855f7 33%, #ec4899 66%, #8b5cf6 100%) !important;
  background-size: 200% 100% !important;
  animation: gradient-shift 2.5s ease-in-out infinite;
  animation-delay: 0.5s;
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

/* Hero content fade in animation */
.hero-fade-in {
  opacity: 0;
  transform: translateY(20px);
  animation: fade-in-up 0.8s ease-out forwards;
}

@keyframes fade-in-up {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Reduced motion preference */
/* @media (prefers-reduced-motion: reduce) {
  .hero-orb,
  .hero-gradient-text,
  .hero-gradient-text-secondary {
    animation: none;
  }

  .hero-gradient-text,
  .hero-gradient-text-secondary {
    background-image: linear-gradient(90deg, hsl(var(--primary)), #a855f7, #ec4899);
    background-size: 100% 100%;
  }

  .hero-fade-in {
    opacity: 1;
    transform: none;
    animation: none;
  }
} */
</style>
