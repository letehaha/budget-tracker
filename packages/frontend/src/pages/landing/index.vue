<template>
  <div class="landing-page bg-background text-foreground min-h-screen">
    <BackgroundOrbs />

    <LandingHeader
      :cta-route="ctaRoute"
      :cta-text-short="ctaTextShort"
      @github-click="trackGitHubClick"
      @cta-click="trackCtaClick"
    />

    <HeroSection
      :cta-route="ctaRoute"
      :cta-text="ctaText"
      :is-logged-in="isLoggedIn"
      :is-demo-loading="isDemoLoading"
      @cta-click="trackCtaClick"
      @try-demo="handleTryDemo"
    />

    <ComparisonSection />

    <FeaturesSection />

    <SelfHostSection :cta-route="ctaRoute" @github-click="trackGitHubClick" @cta-click="trackCtaClick" />

    <CtaSection
      :cta-route="ctaRoute"
      :is-logged-in="isLoggedIn"
      @cta-click="trackCtaClick"
      @github-click="trackGitHubClick"
    />

    <LandingFooter :is-logged-in="isLoggedIn" @github-click="trackGitHubClick" />

    <DemoLoadingOverlay :is-visible="isDemoLoading" />
  </div>
</template>

<script setup lang="ts">
import DemoLoadingOverlay from '@/components/demo/demo-loading-overlay.vue';
import { trackAnalyticsEvent } from '@/lib/posthog';
import { ROUTES_NAMES, router } from '@/routes';
import { useAuthStore } from '@/stores';
import { useHead } from '@unhead/vue';
import { storeToRefs } from 'pinia';
import { computed, onMounted, onUnmounted, ref } from 'vue';

import BackgroundOrbs from './components/background-orbs.vue';
import ComparisonSection from './components/comparison-section.vue';
import CtaSection from './components/cta-section.vue';
import FeaturesSection from './components/features-section.vue';
import HeroSection from './components/hero-section.vue';
import LandingFooter from './components/landing-footer.vue';
import LandingHeader from './components/landing-header.vue';
import SelfHostSection from './components/self-host-section.vue';

const authStore = useAuthStore();
const { isLoggedIn } = storeToRefs(authStore);
const { isReturningUser } = authStore;

const isDemoLoading = ref(false);

const handleTryDemo = async () => {
  if (isDemoLoading.value) return;

  isDemoLoading.value = true;
  trackAnalyticsEvent({
    event: 'demo_started',
    properties: { location: 'hero' },
  });

  try {
    await authStore.startDemo();
    router.push({ name: ROUTES_NAMES.home });
  } catch (error) {
    console.error('Failed to start demo:', error);
  } finally {
    isDemoLoading.value = false;
  }
};

// Validate session on landing page to check if user has a valid session
// This handles both regular users (with stored token) and demo users (with session cookie)
// Note: Not awaited to avoid blocking page render (important for prerendering)
onMounted(() => {
  if (!isLoggedIn.value) {
    authStore.validateSession().catch(() => {
      // Silently ignore - user is simply not logged in
    });
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
const trackGitHubClick = (location: 'header_nav' | 'header_star' | 'hero' | 'self_host' | 'cta_section' | 'footer') => {
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
const ogImage = `${siteUrl}/img/og-image.jpg`;

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
</style>
