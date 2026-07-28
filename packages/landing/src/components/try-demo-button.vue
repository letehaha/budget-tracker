<template>
  <div class="flex flex-col items-center gap-2">
    <button
      :disabled="isDemoLoading"
      class="border-primary/50 text-primary hover:bg-primary/10 flex w-full items-center justify-center gap-2 rounded-xl border-2 px-8 py-3.5 text-base font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      @click="handleTryDemo"
    >
      <!-- PlayCircle icon -->
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="size-5"
      >
        <circle cx="12" cy="12" r="10" />
        <polygon points="10 8 16 12 10 16 10 8" />
      </svg>
      Try Demo
    </button>
    <span v-if="errorMessage" class="text-destructive-text max-w-xs text-center text-xs" role="alert">
      {{ errorMessage }}
    </span>
    <span v-else class="text-muted-foreground text-xs">No signup required &bull; Sample data</span>
  </div>

  <DemoLoadingOverlay :is-visible="isDemoLoading" />
</template>

<script setup lang="ts">
import { ref } from 'vue';

import { config } from '../lib/config';
import { trackAnalyticsEvent } from '../lib/posthog';
import DemoLoadingOverlay from './demo-loading-overlay.vue';

const TOO_MANY_REQUESTS = 429;

const isDemoLoading = ref(false);
const errorMessage = ref('');

async function handleTryDemo() {
  if (isDemoLoading.value) return;

  isDemoLoading.value = true;
  errorMessage.value = '';
  trackAnalyticsEvent({ event: 'demo_started', properties: { location: 'hero' } });
  const startedAt = Date.now();

  try {
    const response = await fetch(`${config.apiHttp}${config.apiVer}/demo`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const isRateLimited = response.status === TOO_MANY_REQUESTS;

      trackAnalyticsEvent({
        event: 'demo_setup_failed',
        properties: { reason: isRateLimited ? 'rate_limited' : 'server_error', status: response.status },
      });
      errorMessage.value = isRateLimited
        ? 'Too many demo sessions from this network. Please try again in a few minutes.'
        : "Couldn't start the demo. Please try again.";
      isDemoLoading.value = false;
      return;
    }

    trackAnalyticsEvent({ event: 'demo_setup_succeeded', properties: { duration_ms: Date.now() - startedAt } });

    // Backend sets session cookies automatically via Set-Cookie headers.
    // Redirect to dashboard with a full page load so the Vue SPA picks up the session.
    window.location.href = '/dashboard';
  } catch (error) {
    console.error('Failed to start demo:', error);
    trackAnalyticsEvent({ event: 'demo_setup_failed', properties: { reason: 'network' } });
    errorMessage.value = "Couldn't reach the server. Please check your connection and try again.";
    isDemoLoading.value = false;
  }
}
</script>
