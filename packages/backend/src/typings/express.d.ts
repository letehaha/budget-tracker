// This import makes the file a module so `declare module` below acts as
// augmentation (extending express types) rather than a full module declaration
// (replacing them). Do not remove it.
import 'express';

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
      user?: { id: number; username: string; authUserId: string; role: string } | null;
    }
  }
}
