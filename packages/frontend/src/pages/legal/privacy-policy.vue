<template>
  <div class="bg-background text-foreground min-h-screen">
    <!-- Header -->
    <header class="border-border/40 bg-background/80 sticky top-0 z-50 border-b backdrop-blur-xl">
      <div class="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div class="flex h-16 items-center justify-between">
          <router-link :to="{ name: ROUTES_NAMES.landing }" class="flex items-center gap-2">
            <img src="/img/logo.svg" class="size-8" />
            <span class="text-xl font-bold">MoneyMatter</span>
          </router-link>

          <router-link
            :to="{ name: ROUTES_NAMES.landing }"
            class="text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            Back to Home
          </router-link>
        </div>
      </div>
    </header>

    <!-- Content -->
    <main class="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 class="mb-2 text-3xl font-bold tracking-tight sm:text-4xl">Privacy Policy</h1>
      <p class="text-muted-foreground mb-8">Last updated: {{ lastUpdated }}</p>

      <div class="prose prose-invert max-w-none space-y-8">
        <section>
          <h2 class="text-xl font-semibold">1. Introduction</h2>
          <p class="text-muted-foreground mt-2">
            MoneyMatter ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how
            we collect, use, and safeguard your information when you use our personal finance application.
          </p>
        </section>

        <section>
          <h2 class="text-xl font-semibold">2. Information We Collect</h2>
          <div class="text-muted-foreground mt-2 space-y-3">
            <p>
              <strong class="text-foreground">Account Information:</strong> Email address and password for
              authentication.
            </p>
            <p>
              <strong class="text-foreground">Financial Data:</strong> Transaction records, account balances,
              categories, and budgets that you enter or sync from connected banks.
            </p>
            <p>
              <strong class="text-foreground">Bank Connection Credentials:</strong> If you use bank integrations, we
              store encrypted API credentials to maintain your connections.
            </p>
            <p>
              <strong class="text-foreground">Usage Data:</strong> Basic analytics to improve the application
              experience.
            </p>
          </div>
        </section>

        <section>
          <h2 class="text-xl font-semibold">3. How We Use Your Information</h2>
          <ul class="text-muted-foreground mt-2 list-inside list-disc space-y-2">
            <li>To provide and maintain the MoneyMatter service</li>
            <li>To sync your financial data from connected bank accounts</li>
            <li>To categorize and analyze your transactions</li>
            <li>To send important service-related notifications</li>
            <li>To improve and optimize the application</li>
          </ul>
        </section>

        <section>
          <h2 class="text-xl font-semibold">4. Data Storage and Security</h2>
          <div class="text-muted-foreground mt-2 space-y-3">
            <p>
              Your data is stored securely in our database. Sensitive information such as bank API credentials is
              encrypted at rest.
            </p>
            <p>
              If you self-host MoneyMatter, your data remains entirely on your own infrastructure and never touches our
              servers.
            </p>
          </div>
        </section>

        <section>
          <h2 class="text-xl font-semibold">5. Third-Party Services</h2>
          <div class="text-muted-foreground mt-2 space-y-3">
            <p>We may use third-party services for:</p>
            <ul class="mt-2 list-inside list-disc space-y-1">
              <li>Bank data aggregation (Enable Banking, Monobank API)</li>
              <li>AI-powered transaction categorization (optional)</li>
            </ul>
            <p class="mt-3">
              These services have their own privacy policies. Bank connections are made using your own credentials, and
              we act only as an intermediary.
            </p>
          </div>
        </section>

        <section>
          <h2 class="text-xl font-semibold">6. Data Retention</h2>
          <p class="text-muted-foreground mt-2">
            We retain your data for as long as your account is active. You can request deletion of your account and all
            associated data at any time through the application settings.
          </p>
        </section>

        <section>
          <h2 class="text-xl font-semibold">7. Your Rights</h2>
          <ul class="text-muted-foreground mt-2 list-inside list-disc space-y-2">
            <li>Access your personal data</li>
            <li>Export your financial data</li>
            <li>Request correction of inaccurate data</li>
            <li>Request deletion of your data</li>
            <li>Disconnect bank integrations at any time</li>
            <li>Delete all your data at any time permanently</li>
          </ul>
        </section>

        <section>
          <h2 class="text-xl font-semibold">8. Open Source</h2>
          <p class="text-muted-foreground mt-2">
            MoneyMatter is open source software. You can review exactly how we handle your data by examining our source
            code on
            <a
              href="https://github.com/letehaha/budget-tracker"
              target="_blank"
              rel="noopener noreferrer"
              class="text-primary hover:underline"
            >
              GitHub </a
            >.
          </p>
        </section>

        <section>
          <h2 class="text-xl font-semibold">9. Changes to This Policy</h2>
          <p class="text-muted-foreground mt-2">
            We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new
            Privacy Policy on this page and updating the "Last updated" date.
          </p>
        </section>

        <section>
          <h2 class="text-xl font-semibold">10. Contact Us</h2>
          <p class="text-muted-foreground mt-2">
            If you have questions about this Privacy Policy, please open an issue on our
            <a
              href="https://github.com/letehaha/budget-tracker/issues"
              target="_blank"
              rel="noopener noreferrer"
              class="text-primary hover:underline"
            >
              GitHub repository </a
            >.
          </p>
        </section>
      </div>
    </main>

    <!-- Footer -->
    <footer class="border-border/40 border-t py-8">
      <div class="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div class="text-muted-foreground flex flex-wrap items-center justify-center gap-4 text-sm">
          <router-link :to="{ name: ROUTES_NAMES.landing }" class="hover:text-foreground transition-colors">
            Home
          </router-link>
          <router-link :to="{ name: ROUTES_NAMES.termsOfUse }" class="hover:text-foreground transition-colors">
            Terms of Service
          </router-link>
          <span>&copy; {{ currentYear }} MoneyMatter</span>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ROUTES_NAMES } from '@/routes';
import { useHead } from '@unhead/vue';
import { computed, onMounted, onUnmounted } from 'vue';

const lastUpdated = 'December 21, 2025';
const currentYear = computed(() => new Date().getFullYear());

useHead({
  title: 'Privacy Policy - MoneyMatter',
  meta: [
    { name: 'description', content: 'MoneyMatter Privacy Policy - Learn how we collect, use, and protect your data.' },
  ],
});

onMounted(() => {
  document.documentElement.style.overflow = 'auto';
  document.body.style.overflow = 'auto';
});

onUnmounted(() => {
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
});
</script>
