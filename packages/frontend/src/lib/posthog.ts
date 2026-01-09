import posthog from 'posthog-js';
import type { Router } from 'vue-router';

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST;

/**
 * Check if PostHog should be enabled.
 * Only enabled in production with valid API key.
 */
function isPostHogEnabled(): boolean {
  const isProduction = import.meta.env.PROD;
  const hasKey = Boolean(POSTHOG_KEY);

  return isProduction && hasKey;
}

/**
 * Initialize PostHog analytics.
 * Should be called early in app initialization.
 */
export function initPostHog(): void {
  if (!isPostHogEnabled()) {
    return;
  }

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST || 'https://eu.i.posthog.com',
    // Disable automatic pageview capture - we handle it manually via router
    capture_pageview: false,
    // Disable pageleave to reduce events (pageviews are enough for session tracking)
    capture_pageleave: false,
    // IMPORTANT: Disable autocapture to save quota
    // Autocapture tracks every click, form submit, input change - very expensive
    autocapture: false,
    // Disable session recording to save quota (recordings are expensive)
    // Enable selectively if needed for debugging specific user issues
    disable_session_recording: true,
    // Respect Do Not Track
    respect_dnt: true,
    // Persistence
    persistence: 'localStorage+cookie',
    // Cross-subdomain cookies
    cross_subdomain_cookie: false,
  });
}

/**
 * Set up router integration for automatic pageview tracking.
 */
export function setupPostHogRouterTracking({ router }: { router: Router }): void {
  if (!isPostHogEnabled()) {
    return;
  }

  router.afterEach((to) => {
    // Capture pageview with route info
    posthog.capture('$pageview', {
      $current_url: window.location.href,
      route_name: to.name as string,
      route_path: to.path,
    });
  });
}

/**
 * Identify a user after login.
 * Call this when user logs in or session is restored.
 */
export function identifyUser({
  userId,
  email,
  username,
  properties,
}: {
  userId: string | number;
  email?: string;
  username?: string;
  properties?: Record<string, unknown>;
}): void {
  if (!isPostHogEnabled()) {
    return;
  }

  posthog.identify(String(userId), {
    email,
    username,
    ...properties,
  });
}

/**
 * Reset user identification (call on logout).
 */
export function resetUser(): void {
  if (!isPostHogEnabled()) {
    return;
  }

  posthog.reset();
}
