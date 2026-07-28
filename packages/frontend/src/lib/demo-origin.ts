import type { DemoEndReason } from './posthog';

// Breadcrumb written when a demo session ends. The next sign-in reads it to link a new
// account back to that demo.
const DEMO_ORIGIN_KEY = 'demo-origin';
// Ignore a signup further than this from the demo.
const DEMO_ORIGIN_TTL_MS = 24 * 60 * 60 * 1000;

interface DemoOrigin {
  endedAt: number;
  reason: DemoEndReason;
}

export function markDemoOrigin({ reason }: { reason: DemoEndReason }): void {
  const origin: DemoOrigin = { endedAt: Date.now(), reason };
  localStorage.setItem(DEMO_ORIGIN_KEY, JSON.stringify(origin));
}

/**
 * Reads and clears the breadcrumb, returning person properties that link a fresh
 * account back to the demo session it followed.
 *
 * `posthog.reset()` on logout and the server-side delete of the demo user give the demo
 * visitor and the account they sign up with two unrelated distinct IDs. Nothing else
 * bridges the two, so this is the only way to compute a conversion rate.
 *
 * `isFirstSignInOnDevice` gates the attribution: someone who already uses an account on
 * this device and poked at the demo in between has not converted. Either way the call
 * clears the breadcrumb, which describes one demo session rather than the device.
 */
export function consumeDemoOriginProperties({
  isFirstSignInOnDevice,
}: {
  isFirstSignInOnDevice: boolean;
}): Record<string, unknown> {
  const stored = localStorage.getItem(DEMO_ORIGIN_KEY);
  if (!stored) return {};

  localStorage.removeItem(DEMO_ORIGIN_KEY);
  if (!isFirstSignInOnDevice) return {};

  let origin: DemoOrigin;
  try {
    origin = JSON.parse(stored) as DemoOrigin;
  } catch {
    return {};
  }

  if (typeof origin?.endedAt !== 'number') return {};

  const elapsedMs = Date.now() - origin.endedAt;
  if (elapsedMs < 0 || elapsedMs > DEMO_ORIGIN_TTL_MS) return {};

  return {
    came_from_demo: true,
    demo_end_reason: origin.reason,
    minutes_since_demo: Math.round(elapsedMs / 60_000),
  };
}
