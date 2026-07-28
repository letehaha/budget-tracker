import posthog from 'posthog-js';

import { config } from './config';

type LandingAnalyticsEvent =
  | {
      event: 'landing_cta_clicked';
      properties: { location: 'header' | 'hero' | 'cta_section' | 'self_host'; action: string };
    }
  | {
      event: 'landing_github_clicked';
      properties: { location: 'header_nav' | 'header_star' | 'hero' | 'self_host' | 'cta_section' | 'footer' };
    }
  | { event: 'demo_started'; properties: { location: 'hero' } }
  // `demo_started` fires on click; these two close out that funnel.
  // Setup bulk-inserts ~1.5k transactions and rebuilds balances twice, so without
  // them a slow or rejected run looks the same as a visitor who never clicked.
  | { event: 'demo_setup_succeeded'; properties: { duration_ms: number } }
  | {
      event: 'demo_setup_failed';
      properties: { reason: 'rate_limited' | 'server_error' | 'network'; status?: number };
    };

function isPostHogEnabled(): boolean {
  return import.meta.env.PROD && Boolean(config.posthogKey);
}

export function initPostHog(): void {
  if (!isPostHogEnabled()) return;

  posthog.init(config.posthogKey!, {
    api_host: config.posthogHost || '/helper',
    ui_host: 'https://eu.posthog.com',
    // The landing is a static multi-page site, so built-in capture is its only pageview source.
    // The SPA captures pageviews manually on route change.
    capture_pageview: true,
    // Records dwell time and marks the landing page as an exit point.
    capture_pageleave: true,
    autocapture: false,
    disable_session_recording: true,
    respect_dnt: true,
    persistence: 'localStorage+cookie',
    cross_subdomain_cookie: false,
    on_request_error: () => {
      // Silently ignore — user likely has an ad blocker
    },
  });
}

export function trackAnalyticsEvent(eventData: LandingAnalyticsEvent): void {
  if (!isPostHogEnabled()) return;

  const { event, properties } = eventData;

  posthog.capture(event, {
    source: 'landing',
    ...properties,
  });
}
