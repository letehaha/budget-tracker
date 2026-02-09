import posthog from 'posthog-js';
import type { Router } from 'vue-router';

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST;

// ============================================
// Event Types
// ============================================

/**
 * Frontend analytics events.
 *
 * Note: Completion events (bank_connected, import_completed, ai_categorization_completed)
 * are tracked on the backend for reliability - they confirm actual success.
 */
type AnalyticsEvent =
  // Landing page
  | { event: 'landing_cta_clicked'; properties: { location: 'header' | 'hero' | 'cta_section'; action: string } }
  | {
      event: 'landing_github_clicked';
      properties: { location: 'header_nav' | 'header_star' | 'hero' | 'self_host' | 'cta_section' | 'footer' };
    }
  // Demo mode
  | { event: 'demo_started'; properties: { location: 'hero' } }
  | { event: 'demo_signup_clicked'; properties: { location: 'banner' } }
  // Language selector
  | { event: 'language_changed'; properties: { from_locale: string; to_locale: string } }
  // Onboarding funnel
  | { event: 'onboarding_visited' }
  | { event: 'onboarding_completed'; properties: { base_currency: string } }
  // Account creation funnel
  | { event: 'account_creation_opened' }
  | { event: 'account_created'; properties: { currency: string } }
  // Bank connection funnel (bank_connected tracked on backend)
  | { event: 'bank_connection_opened'; properties: { provider: string } }
  // Transaction creation funnel
  | { event: 'transaction_creation_opened' }
  | { event: 'transaction_created'; properties: { transaction_type: 'income' | 'expense' | 'transfer' } }
  // Budget creation funnel
  | { event: 'budget_creation_opened' }
  | { event: 'budget_created' }
  // Import funnel (import_completed tracked on backend)
  | { event: 'import_opened'; properties: { import_type: 'csv' | 'statement_parser' } }
  // AI features (ai_categorization_completed tracked on backend)
  | { event: 'ai_feature_used'; properties: { feature: 'statement_parser' | 'categorization' } }
  | { event: 'ai_settings_visited' }
  | { event: 'ai_key_set'; properties: { provider: 'openai' | 'anthropic' | 'google' | 'groq' } }
  // Feedback
  | {
      event: 'user_feedback_submitted';
      properties: {
        feedback_type: 'bug' | 'feature_request' | 'other';
        message: string;
      };
    };

// ============================================
// Core Functions
// ============================================

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
    // Use reverse proxy to bypass ad blockers (nginx proxies /helper to PostHog)
    api_host: POSTHOG_HOST || '/helper',
    // Required when using proxy - keeps dashboard links working
    ui_host: 'https://eu.posthog.com',
    // Disable automatic pageview capture - we track specific events instead
    capture_pageview: false,
    // Disable pageleave to reduce events
    capture_pageleave: false,
    // IMPORTANT: Disable autocapture to save quota
    // Autocapture tracks every click, form submit, input change - very expensive
    autocapture: false,
    // Disable session recording to save quota (recordings are expensive)
    disable_session_recording: true,
    // Respect Do Not Track
    respect_dnt: true,
    // Persistence
    persistence: 'localStorage+cookie',
    // Cross-subdomain cookies
    cross_subdomain_cookie: false,
    // Silently handle errors (e.g., when blocked by ad blockers)
    on_request_error: () => {
      // Silently ignore - user likely has an ad blocker
    },
  });
}

/**
 * Track a typed analytics event.
 * All frontend events are automatically tagged with source: 'fe'.
 */
export function trackAnalyticsEvent(eventData: AnalyticsEvent): void {
  if (!isPostHogEnabled()) {
    return;
  }

  const { event, ...rest } = eventData as AnalyticsEvent & { properties?: Record<string, unknown> };
  const properties = 'properties' in rest ? rest.properties : undefined;

  posthog.capture(event, {
    source: 'fe',
    ...properties,
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

/**
 * Track $pageview events on SPA route changes.
 * Since capture_pageview is disabled (to avoid duplicate on initial load),
 * we manually capture pageviews via router.afterEach.
 */
export function trackPageviews({ router }: { router: Router }): void {
  if (!isPostHogEnabled()) {
    return;
  }

  router.afterEach((to) => {
    posthog.capture('$pageview', {
      $current_url: window.location.href,
      $pathname: to.path,
    });
  });
}
