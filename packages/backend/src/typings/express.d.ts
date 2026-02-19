import { BodyPayload } from '@bt/shared/types/endpoints';
import type { SESSION_ID_KEY_NAME } from '@common/types';

declare module 'express' {
  interface Request {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: BodyPayload;
    requestId?: string; // Optional requestId property
    [SESSION_ID_KEY_NAME]?: string | null; // Optional sessionId property
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: { id: number; username: string; authUserId: string; role: string } | null;
    }
  }
}
