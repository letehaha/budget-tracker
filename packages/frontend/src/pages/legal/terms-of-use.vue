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
      <h1 class="mb-2 text-3xl font-bold tracking-tight sm:text-4xl">Terms of Service</h1>
      <p class="text-muted-foreground mb-8">Last updated: {{ lastUpdated }}</p>

      <div class="prose prose-invert max-w-none space-y-8">
        <section>
          <h2 class="text-xl font-semibold">1. Acceptance of Terms</h2>
          <p class="text-muted-foreground mt-2">
            By accessing or using MoneyMatter ("the Service"), you agree to be bound by these Terms of Service. If you
            do not agree to these terms, please do not use the Service.
          </p>
        </section>

        <section>
          <h2 class="text-xl font-semibold">2. Description of Service</h2>
          <p class="text-muted-foreground mt-2">
            MoneyMatter is a personal finance management application that allows you to track expenses, manage budgets,
            connect bank accounts, and analyze your financial data. The Service is provided "as is" and "as available."
          </p>
        </section>

        <section>
          <h2 class="text-xl font-semibold">3. Acceptable Use</h2>
          <div class="text-muted-foreground mt-2 space-y-3">
            <p>You agree not to:</p>
            <ul class="mt-2 list-inside list-disc space-y-1">
              <li>Use the Service for any illegal purpose</li>
              <li>Attempt to gain unauthorized access to the Service or its systems</li>
              <li>Interfere with or disrupt the Service</li>
              <li>Upload malicious code or content</li>
              <li>Scrape or collect data from other users</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 class="text-xl font-semibold">4. Bank Integrations</h2>
          <div class="text-muted-foreground mt-2 space-y-3">
            <p>
              If you choose to connect your bank accounts, you acknowledge that:
            </p>
            <ul class="mt-2 list-inside list-disc space-y-1">
              <li>You are providing your own API credentials or authorizing access through OAuth</li>
              <li>We act as an intermediary and are not responsible for bank API availability</li>
              <li>Bank connections may require periodic re-authorization</li>
              <li>Transaction data accuracy depends on the information provided by your bank</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 class="text-xl font-semibold">5. Data and Content</h2>
          <div class="text-muted-foreground mt-2 space-y-3">
            <p>
              You retain ownership of all financial data you enter into the Service. By using the Service, you grant us
              a limited license to store, process, and display your data solely for the purpose of providing the
              Service.
            </p>
            <p>
              You are responsible for the accuracy of the data you enter and for maintaining backups of important
              information.
            </p>
          </div>
        </section>

        <section>
          <h2 class="text-xl font-semibold">6. Open Source License</h2>
          <p class="text-muted-foreground mt-2">
            MoneyMatter is open source software licensed under CC BY-NC-SA 4.0. You may self-host and modify the
            software in accordance with this license. The source code is available on
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
          <h2 class="text-xl font-semibold">7. Disclaimer of Warranties</h2>
          <div class="text-muted-foreground mt-2 space-y-3">
            <p>
              THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. WE DO NOT WARRANT
              THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE.
            </p>
            <p>
              MoneyMatter is not a financial advisor. The Service is for informational and tracking purposes only. You
              should consult a qualified financial professional for financial advice.
            </p>
          </div>
        </section>

        <section>
          <h2 class="text-xl font-semibold">8. Limitation of Liability</h2>
          <p class="text-muted-foreground mt-2">
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
            CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF DATA OR FINANCIAL LOSSES, ARISING FROM YOUR USE OF
            THE SERVICE.
          </p>
        </section>

        <section>
          <h2 class="text-xl font-semibold">9. Service Modifications</h2>
          <p class="text-muted-foreground mt-2">
            We reserve the right to modify, suspend, or discontinue the Service at any time without notice. We are not
            liable for any modification, suspension, or discontinuation of the Service.
          </p>
        </section>

        <section>
          <h2 class="text-xl font-semibold">10. Termination</h2>
          <p class="text-muted-foreground mt-2">
            We may terminate or suspend your account at any time for violation of these terms. You may delete your
            account at any time through the application settings. Upon termination, your right to use the Service will
            immediately cease.
          </p>
        </section>

        <section>
          <h2 class="text-xl font-semibold">11. Changes to Terms</h2>
          <p class="text-muted-foreground mt-2">
            We may update these Terms of Service from time to time. Continued use of the Service after changes
            constitutes acceptance of the new terms. We will notify users of significant changes.
          </p>
        </section>

        <section>
          <h2 class="text-xl font-semibold">12. Contact</h2>
          <p class="text-muted-foreground mt-2">
            For questions about these Terms, please open an issue on our
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
          <router-link :to="{ name: ROUTES_NAMES.privacyPolicy }" class="hover:text-foreground transition-colors">
            Privacy Policy
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
  title: 'Terms of Service - MoneyMatter',
  meta: [{ name: 'description', content: 'MoneyMatter Terms of Service - Read our terms and conditions for using the service.' }],
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
