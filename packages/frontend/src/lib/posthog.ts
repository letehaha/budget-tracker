import posthog from 'posthog-js';

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST;

// ============================================
// Event Types
// ============================================

export type AnalyticsEvent =
  // Onboarding funnel
  | { event: 'onboarding_visited' }
  | { event: 'onboarding_completed'; properties: { base_currency: string } }
  // Account creation funnel
  | { event: 'account_creation_opened' }
  | { event: 'account_created'; properties: { currency: string } }
  // Bank connection funnel
  | { event: 'bank_connection_opened'; properties: { provider: string } }
  | { event: 'bank_connected'; properties: { provider: string; accounts_count: number } }
  // Transaction creation funnel
  | { event: 'transaction_creation_opened' }
  | { event: 'transaction_created'; properties: { transaction_type: 'income' | 'expense' | 'transfer' } }
  // Budget creation funnel
  | { event: 'budget_creation_opened' }
  | { event: 'budget_created' }
  // Import funnel
  | { event: 'import_opened'; properties: { import_type: 'csv' | 'statement_parser' } }
  | { event: 'import_completed'; properties: { import_type: 'csv' | 'statement_parser'; transactions_count: number } }
  // AI features
  | { event: 'ai_feature_used'; properties: { feature: 'statement_parser' | 'categorization' } }
  | { event: 'ai_settings_visited' }
  | { event: 'ai_key_set'; properties: { provider: 'openai' | 'anthropic' | 'google' | 'groq' } };

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
    api_host: POSTHOG_HOST || 'https://eu.i.posthog.com',
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
  });
}

/**
 * Track a typed analytics event.
 */
export function trackAnalyticsEvent(eventData: AnalyticsEvent): void {
  if (!isPostHogEnabled()) {
    return;
  }

  const { event, ...rest } = eventData as AnalyticsEvent & { properties?: Record<string, unknown> };
  const properties = 'properties' in rest ? rest.properties : undefined;

  posthog.capture(event, properties);
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
