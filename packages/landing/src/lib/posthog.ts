import posthog from 'posthog-js';

const POSTHOG_KEY = import.meta.env.PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.PUBLIC_POSTHOG_HOST;

type LandingAnalyticsEvent =
  | {
      event: 'landing_cta_clicked';
      properties: { location: 'header' | 'hero' | 'cta_section' | 'self_host'; action: string };
    }
  | {
      event: 'landing_github_clicked';
      properties: { location: 'header_nav' | 'header_star' | 'hero' | 'self_host' | 'cta_section' | 'footer' };
    }
  | { event: 'demo_started'; properties: { location: 'hero' } };

function isPostHogEnabled(): boolean {
  return import.meta.env.PROD && Boolean(POSTHOG_KEY);
}

export function initPostHog(): void {
  if (!isPostHogEnabled()) return;

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST || '/helper',
    ui_host: 'https://eu.posthog.com',
    capture_pageview: false,
    capture_pageleave: false,
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
