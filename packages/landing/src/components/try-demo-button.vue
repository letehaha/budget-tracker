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
    <span class="text-muted-foreground text-xs">No signup required &bull; Sample data</span>
  </div>

  <DemoLoadingOverlay :is-visible="isDemoLoading" />
</template>

<script setup lang="ts">
import { ref } from 'vue';

import { trackAnalyticsEvent } from '../lib/posthog';
import DemoLoadingOverlay from './demo-loading-overlay.vue';

const isDemoLoading = ref(false);

const API_BASE = import.meta.env.VITE_APP_API_HTTP || '';
const API_VER = import.meta.env.VITE_APP_API_VER || '/api/v1';

async function handleTryDemo() {
  if (isDemoLoading.value) return;

  isDemoLoading.value = true;
  trackAnalyticsEvent({ event: 'demo_started', properties: { location: 'hero' } });

  try {
    const response = await fetch(`${API_BASE}${API_VER}/demo`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Demo request failed: ${response.status}`);
    }

    // Backend sets session cookies automatically via Set-Cookie headers.
    // Redirect to dashboard with a full page load so the Vue SPA picks up the session.
    window.location.href = '/dashboard';
  } catch (error) {
    console.error('Failed to start demo:', error);
    isDemoLoading.value = false;
  }
}
</script>
