<template>
  <section class="relative z-10 py-16 sm:py-24">
    <div class="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-2xl text-center">
        <h2 class="text-2xl font-bold tracking-tight sm:text-3xl">Why MoneyMatter?</h2>
        <p class="text-muted-foreground mt-4 text-lg">Not all budget apps are created equal.</p>
      </div>

      <!-- Comparison Table (Desktop) -->
      <div class="border-border/50 bg-card mt-12 hidden overflow-hidden rounded-2xl border md:block">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-border/50 border-b">
              <th class="text-muted-foreground px-6 py-4 text-left font-medium">Feature</th>
              <th class="text-muted-foreground px-6 py-4 text-center font-medium">Mint & others</th>
              <th class="text-muted-foreground px-6 py-4 text-center font-medium">YNAB</th>
              <th class="bg-primary/5 text-primary px-6 py-4 text-center font-semibold">MoneyMatter</th>
            </tr>
          </thead>
          <tbody class="divide-border/50 divide-y">
            <tr>
              <td class="px-6 py-3">
                <div class="flex items-center gap-2">
                  <DollarSign class="text-muted-foreground size-4 shrink-0" />
                  <span class="font-medium">Price</span>
                </div>
              </td>
              <td class="text-muted-foreground px-6 py-3 text-center">Free (you're the product)</td>
              <td class="text-muted-foreground px-6 py-3 text-center">$99/year</td>
              <td class="bg-primary/5 px-6 py-3 text-center font-medium">Free forever</td>
            </tr>
            <tr>
              <td class="px-6 py-3">
                <div class="flex items-center gap-2">
                  <Code2 class="text-muted-foreground size-4 shrink-0" />
                  <span class="font-medium">Open Source</span>
                </div>
              </td>
              <td class="px-6 py-3 text-center"><X class="text-destructive-text mx-auto size-4" /></td>
              <td class="px-6 py-3 text-center"><X class="text-destructive-text mx-auto size-4" /></td>
              <td class="bg-primary/5 px-6 py-3 text-center"><Check class="text-primary mx-auto size-4" /></td>
            </tr>
            <tr>
              <td class="px-6 py-3">
                <div class="flex items-center gap-2">
                  <Server class="text-muted-foreground size-4 shrink-0" />
                  <span class="font-medium">Self-Hostable</span>
                </div>
              </td>
              <td class="px-6 py-3 text-center"><X class="text-destructive-text mx-auto size-4" /></td>
              <td class="px-6 py-3 text-center"><X class="text-destructive-text mx-auto size-4" /></td>
              <td class="bg-primary/5 px-6 py-3 text-center"><Check class="text-primary mx-auto size-4" /></td>
            </tr>
            <tr>
              <td class="px-6 py-3">
                <div class="flex items-center gap-2">
                  <ShieldCheck class="text-muted-foreground size-4 shrink-0" />
                  <span class="font-medium">Data Privacy</span>
                </div>
              </td>
              <td class="px-6 py-3 text-center"><span class="text-destructive-text">Sells data</span></td>
              <td class="text-muted-foreground px-6 py-3 text-center">Stored on their servers</td>
              <td class="bg-primary/5 px-6 py-3 text-center font-medium">You own it 100%</td>
            </tr>
            <tr>
              <td class="px-6 py-3">
                <div class="flex items-center gap-2">
                  <TrendingUp class="text-muted-foreground size-4 shrink-0" />
                  <span class="font-medium">Investment Tracking</span>
                </div>
              </td>
              <td class="px-6 py-3 text-center"><X class="text-destructive-text mx-auto size-4" /></td>
              <td class="px-6 py-3 text-center"><X class="text-destructive-text mx-auto size-4" /></td>
              <td class="bg-primary/5 px-6 py-3 text-center"><Check class="text-primary mx-auto size-4" /></td>
            </tr>
            <tr>
              <td class="px-6 py-3">
                <div class="flex items-center gap-2">
                  <Lightbulb class="text-muted-foreground size-4 shrink-0" />
                  <span class="font-medium">AI Categorization</span>
                </div>
              </td>
              <td class="px-6 py-3 text-center"><X class="text-destructive-text mx-auto size-4" /></td>
              <td class="px-6 py-3 text-center"><X class="text-destructive-text mx-auto size-4" /></td>
              <td class="bg-primary/5 px-6 py-3 text-center"><Check class="text-primary mx-auto size-4" /></td>
            </tr>
            <tr>
              <td class="px-6 py-3">
                <div class="flex items-center gap-2">
                  <Tag class="text-muted-foreground size-4 shrink-0" />
                  <span class="font-medium">Custom Categories</span>
                </div>
              </td>
              <td class="text-muted-foreground px-6 py-3 text-center">Limited</td>
              <td class="px-6 py-3 text-center"><Check class="text-primary mx-auto size-4" /></td>
              <td class="bg-primary/5 px-6 py-3 text-center"><Check class="text-primary mx-auto size-4" /></td>
            </tr>
            <tr>
              <td class="px-6 py-3">
                <div class="flex items-center gap-2">
                  <Download class="text-muted-foreground size-4 shrink-0" />
                  <span class="font-medium">Export Data</span>
                </div>
              </td>
              <td class="text-muted-foreground px-6 py-3 text-center">Limited</td>
              <td class="px-6 py-3 text-center"><Check class="text-primary mx-auto size-4" /></td>
              <td class="bg-primary/5 px-6 py-3 text-center"><Check class="text-primary mx-auto size-4" /></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Comparison List (Mobile) -->
      <div class="mt-12 space-y-4 md:hidden">
        <!-- Price -->
        <div class="border-border/50 bg-card rounded-xl border p-4">
          <div class="mb-3 flex items-center gap-2">
            <DollarSign class="size-4 opacity-70" />
            <span class="font-semibold">Price</span>
          </div>
          <div class="space-y-2 text-sm">
            <div class="flex items-center justify-between">
              <span>Mint & others</span>
              <span class="opacity-70">Free (you're the product)</span>
            </div>
            <div class="flex items-center justify-between">
              <span>YNAB</span>
              <span class="opacity-70">$99/year</span>
            </div>
            <div class="bg-primary/10 -mx-4 flex items-center justify-between rounded-lg px-4 py-2">
              <span class="text-primary font-medium">MoneyMatter</span>
              <span class="font-semibold">Free forever</span>
            </div>
          </div>
        </div>

        <!-- Open Source -->
        <div class="border-border/50 bg-card rounded-xl border p-4">
          <div class="mb-3 flex items-center gap-2">
            <Code2 class="size-4 opacity-70" />
            <span class="font-semibold">Open Source</span>
          </div>
          <div class="space-y-2 text-sm">
            <div class="flex items-center justify-between">
              <span>Mint & others</span>
              <X class="text-destructive-text size-4" />
            </div>
            <div class="flex items-center justify-between">
              <span>YNAB</span>
              <X class="text-destructive-text size-4" />
            </div>
            <div class="bg-primary/10 -mx-4 flex items-center justify-between rounded-lg px-4 py-2">
              <span class="text-primary font-medium">MoneyMatter</span>
              <Check class="text-primary size-4" />
            </div>
          </div>
        </div>

        <!-- Self-Hostable -->
        <div class="border-border/50 bg-card rounded-xl border p-4">
          <div class="mb-3 flex items-center gap-2">
            <Server class="size-4 opacity-70" />
            <span class="font-semibold">Self-Hostable</span>
          </div>
          <div class="space-y-2 text-sm">
            <div class="flex items-center justify-between">
              <span>Mint & others</span>
              <X class="text-destructive-text size-4" />
            </div>
            <div class="flex items-center justify-between">
              <span>YNAB</span>
              <X class="text-destructive-text size-4" />
            </div>
            <div class="bg-primary/10 -mx-4 flex items-center justify-between rounded-lg px-4 py-2">
              <span class="text-primary font-medium">MoneyMatter</span>
              <Check class="text-primary size-4" />
            </div>
          </div>
        </div>

        <!-- Data Privacy -->
        <div class="border-border/50 bg-card rounded-xl border p-4">
          <div class="mb-3 flex items-center gap-2">
            <ShieldCheck class="size-4 opacity-70" />
            <span class="font-semibold">Data Privacy</span>
          </div>
          <div class="space-y-2 text-sm">
            <div class="flex items-center justify-between">
              <span>Mint & others</span>
              <span class="text-destructive-text">Sells data</span>
            </div>
            <div class="flex items-center justify-between">
              <span>YNAB</span>
              <span class="opacity-70">Their servers</span>
            </div>
            <div class="bg-primary/10 -mx-4 flex items-center justify-between rounded-lg px-4 py-2">
              <span class="text-primary font-medium">MoneyMatter</span>
              <span class="font-semibold">You own it 100%</span>
            </div>
          </div>
        </div>

        <!-- Investment Tracking -->
        <div class="border-border/50 bg-card rounded-xl border p-4">
          <div class="mb-3 flex items-center gap-2">
            <TrendingUp class="size-4 opacity-70" />
            <span class="font-semibold">Investment Tracking</span>
          </div>
          <div class="space-y-2 text-sm">
            <div class="flex items-center justify-between">
              <span>Mint & others</span>
              <X class="text-destructive-text size-4" />
            </div>
            <div class="flex items-center justify-between">
              <span>YNAB</span>
              <X class="text-destructive-text size-4" />
            </div>
            <div class="bg-primary/10 -mx-4 flex items-center justify-between rounded-lg px-4 py-2">
              <span class="text-primary font-medium">MoneyMatter</span>
              <Check class="text-primary size-4" />
            </div>
          </div>
        </div>

        <!-- AI Categorization -->
        <div class="border-border/50 bg-card rounded-xl border p-4">
          <div class="mb-3 flex items-center gap-2">
            <Lightbulb class="size-4 opacity-70" />
            <span class="font-semibold">AI Categorization</span>
          </div>
          <div class="space-y-2 text-sm">
            <div class="flex items-center justify-between">
              <span>Mint & others</span>
              <X class="text-destructive-text size-4" />
            </div>
            <div class="flex items-center justify-between">
              <span>YNAB</span>
              <X class="text-destructive-text size-4" />
            </div>
            <div class="bg-primary/10 -mx-4 flex items-center justify-between rounded-lg px-4 py-2">
              <span class="text-primary font-medium">MoneyMatter</span>
              <Check class="text-primary size-4" />
            </div>
          </div>
        </div>

        <!-- Custom Categories -->
        <div class="border-border/50 bg-card rounded-xl border p-4">
          <div class="mb-3 flex items-center gap-2">
            <Tag class="size-4 opacity-70" />
            <span class="font-semibold">Custom Categories</span>
          </div>
          <div class="space-y-2 text-sm">
            <div class="flex items-center justify-between">
              <span>Mint & others</span>
              <span class="opacity-70">Limited</span>
            </div>
            <div class="flex items-center justify-between">
              <span>YNAB</span>
              <Check class="text-primary size-4" />
            </div>
            <div class="bg-primary/10 -mx-4 flex items-center justify-between rounded-lg px-4 py-2">
              <span class="text-primary font-medium">MoneyMatter</span>
              <Check class="text-primary size-4" />
            </div>
          </div>
        </div>

        <!-- Export Data -->
        <div class="border-border/50 bg-card rounded-xl border p-4">
          <div class="mb-3 flex items-center gap-2">
            <Download class="size-4 opacity-70" />
            <span class="font-semibold">Export Data</span>
          </div>
          <div class="space-y-2 text-sm">
            <div class="flex items-center justify-between">
              <span>Mint & others</span>
              <span class="opacity-70">Limited</span>
            </div>
            <div class="flex items-center justify-between">
              <span>YNAB</span>
              <Check class="text-primary size-4" />
            </div>
            <div class="bg-primary/10 -mx-4 flex items-center justify-between rounded-lg px-4 py-2">
              <span class="text-primary font-medium">MoneyMatter</span>
              <Check class="text-primary size-4" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import {
  Check,
  Code2,
  DollarSign,
  Download,
  Lightbulb,
  Server,
  ShieldCheck,
  Tag,
  TrendingUp,
  X,
} from 'lucide-vue-next';
</script>
