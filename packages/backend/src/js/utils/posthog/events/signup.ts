import { trackEvent } from '../index';

export type SignupMethod = 'email' | 'google' | 'github' | 'apple' | 'passkey';

/**
 * Track user signup event.
 */
export function trackSignup({
  userId,
  email,
  username,
  method,
  sessionId,
}: {
  userId: string | number;
  email?: string;
  username?: string;
  method: SignupMethod;
  sessionId?: string | null;
}): void {
  trackEvent({
    userId,
    event: 'user_signed_up',
    properties: {
      email,
      username,
      signup_method: method,
    },
    sessionId,
  });
}
