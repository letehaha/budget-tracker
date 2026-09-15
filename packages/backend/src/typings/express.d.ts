// This import makes the file a module so `declare module` below acts as
// augmentation (extending express types) rather than a full module declaration
// (replacing them). Do not remove it.
import 'express';

import type { Entitlements } from '@bt/shared/types';
import type { AppUser } from '@middlewares/better-auth';
import type Stripe from 'stripe';

declare module 'express' {
  interface Request {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: { [key: string | number]: string | number | boolean | undefined };
    requestId?: string;
    sessionId?: string | null;
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: AppUser | null;
      entitlements?: Entitlements;
      stripeEvent?: Stripe.Event;
    }
  }
}
