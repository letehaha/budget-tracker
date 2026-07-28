/**
 * Value of the sign-in route's `reason` query param when a demo session
 * expires on its own (see demo-banner.vue's auto-logout redirect and
 * pages/auth/login.vue, which reads it back to show a notice).
 */
export const DEMO_SESSION_EXPIRED_REASON = 'demo_expired';
