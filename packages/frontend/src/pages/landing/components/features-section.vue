<template>
  <section id="features" class="relative z-10 py-16 sm:py-24">
    <div class="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <!-- Section header -->
      <div class="mx-auto max-w-2xl text-center">
        <h2 class="text-2xl font-bold tracking-tight sm:text-3xl">Core Features</h2>
        <p class="text-muted-foreground mt-4 text-lg">Everything you need to manage your money, nothing you don't.</p>
      </div>

      <!-- Features grid -->
      <div class="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        <!-- Bank Connections -->
        <div
          class="group border-border/50 bg-card hover:border-primary/50 relative overflow-hidden rounded-2xl border p-6 transition-all hover:shadow-lg"
        >
          <div
            class="mb-4 flex size-12 items-center justify-center rounded-xl bg-linear-to-br from-blue-500/10 to-blue-600/10 text-blue-500"
          >
            <Building2 class="size-6" />
          </div>
          <h3 class="mb-2 text-lg font-semibold">Bank Connections</h3>
          <p class="text-muted-foreground text-sm">
            Connect your bank accounts to auto-sync transactions. Currently supports Monobank with more integrations
            coming.
          </p>
        </div>

        <!-- Smart Categorization (AI) -->
        <div
          class="group border-border/50 bg-card hover:border-primary/50 relative overflow-hidden rounded-2xl border p-6 transition-all hover:shadow-lg"
        >
          <div
            class="mb-4 flex size-12 items-center justify-center rounded-xl bg-linear-to-br from-green-500/10 to-green-600/10 text-green-500"
          >
            <Lightbulb class="size-6" />
          </div>
          <h3 class="mb-2 text-lg font-semibold">AI Categorization</h3>
          <p class="text-muted-foreground text-sm">
            AI learns your spending patterns. Categorize once, automate forever. No more manual sorting.
          </p>
        </div>

        <!-- Custom Categories -->
        <div
          class="group border-border/50 bg-card hover:border-primary/50 relative overflow-hidden rounded-2xl border p-6 transition-all hover:shadow-lg"
        >
          <div
            class="mb-4 flex size-12 items-center justify-center rounded-xl bg-linear-to-br from-purple-500/10 to-purple-600/10 text-purple-500"
          >
            <Tag class="size-6" />
          </div>
          <h3 class="mb-2 text-lg font-semibold">Custom Categories</h3>
          <p class="text-muted-foreground text-sm">
            Organize spending your way with unlimited custom categories. No forced structure — your system, your
            rules.
          </p>
        </div>

        <!-- Budgeting -->
        <div
          class="group border-border/50 bg-card hover:border-primary/50 relative overflow-hidden rounded-2xl border p-6 transition-all hover:shadow-lg"
        >
          <div
            class="mb-4 flex size-12 items-center justify-center rounded-xl bg-linear-to-br from-orange-500/10 to-orange-600/10 text-orange-500"
          >
            <BarChart3 class="size-6" />
          </div>
          <h3 class="mb-2 text-lg font-semibold">Budgeting</h3>
          <p class="text-muted-foreground text-sm">
            Set budgets, track progress, stay on target. Visual feedback helps you stick to your spending goals.
          </p>
        </div>

        <!-- Import Transactions -->
        <div
          class="group border-border/50 bg-card hover:border-primary/50 relative overflow-hidden rounded-2xl border p-6 transition-all hover:shadow-lg"
        >
          <div
            class="mb-4 flex size-12 items-center justify-center rounded-xl bg-linear-to-br from-cyan-500/10 to-cyan-600/10 text-cyan-500"
          >
            <FileUp class="size-6" />
          </div>
          <h3 class="mb-2 text-lg font-semibold">Import from Anywhere</h3>
          <p class="text-muted-foreground text-sm">
            Import CSV, bank statements, or use AI to parse any format. Switch from other apps without losing history.
          </p>
        </div>

        <!-- Account Transfers -->
        <div
          class="group border-border/50 bg-card hover:border-primary/50 relative overflow-hidden rounded-2xl border p-6 transition-all hover:shadow-lg"
        >
          <div
            class="mb-4 flex size-12 items-center justify-center rounded-xl bg-linear-to-br from-pink-500/10 to-pink-600/10 text-pink-500"
          >
            <ArrowLeftRight class="size-6" />
          </div>
          <h3 class="mb-2 text-lg font-semibold">Account Transfers</h3>
          <p class="text-muted-foreground text-sm">
            Link transactions between accounts. Track money movement without double-counting or confusion.
          </p>
        </div>

        <!-- Portfolio Tracking -->
        <div
          class="group border-border/50 bg-card hover:border-primary/50 relative overflow-hidden rounded-2xl border p-6 transition-all hover:shadow-lg"
        >
          <div
            class="mb-4 flex size-12 items-center justify-center rounded-xl bg-linear-to-br from-emerald-500/10 to-emerald-600/10 text-emerald-500"
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
            Track investments alongside your budget. Monitor performance, gains, and allocation in one place.
          </p>
        </div>

        <!-- Multi-Currency -->
        <div
          class="group border-border/50 bg-card hover:border-primary/50 relative overflow-hidden rounded-2xl border p-6 transition-all hover:shadow-lg"
        >
          <div
            class="mb-4 flex size-12 items-center justify-center rounded-xl bg-linear-to-br from-indigo-500/10 to-indigo-600/10 text-indigo-500"
          >
            <Globe class="size-6" />
          </div>
          <h3 class="mb-2 text-lg font-semibold">Multi-Currency</h3>
          <p class="text-muted-foreground text-sm">
            Track accounts in any currency with automatic exchange rates. Perfect for travel or international life.
          </p>
        </div>

        <!-- And Many More -->
        <div
          class="group border-border/50 bg-card hover:border-primary/50 relative overflow-hidden rounded-2xl border p-6 transition-all hover:shadow-lg"
        >
          <div
            class="mb-4 flex size-12 items-center justify-center rounded-xl bg-linear-to-br from-gray-500/10 to-gray-600/10 text-gray-500"
          >
            <Sparkles class="size-6" />
          </div>
          <h3 class="mb-2 text-lg font-semibold">And Many More</h3>
          <p class="text-muted-foreground text-sm">
            Tags & notes, recurring transactions, detailed analytics, dark mode, mobile-friendly, data export, and
            more.
          </p>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import {
  ArrowLeftRight,
  BarChart3,
  Building2,
  FileUp,
  Globe,
  Lightbulb,
  Sparkles,
  Tag,
  TrendingUp,
} from 'lucide-vue-next';
</script>
