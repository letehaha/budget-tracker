import { API_RESPONSE_STATUS } from '@bt/shared/types';
import { auth } from '@config/auth';
import { errorHandler } from '@controllers/helpers';
import { logger } from '@js/utils/logger';
import { applyDemoTemplate } from '@services/demo/apply-demo-template.service';
import { createDemoUserFast } from '@services/demo/create-demo-user.service';
import { Request, Response } from 'express';

/**
 * POST /api/v1/demo
 *
 * Creates a new demo user with seeded data and returns session credentials.
 * Rate limited to 5 requests per 15 minutes per IP.
 */
export const startDemo = async (req: Request, res: Response) => {
  try {
    logger.info(`Demo session requested from IP: ${req.ip}`);

    // 1. Create demo user records (auth + app user, no data seeding)
    const { user, email, password } = await createDemoUserFast();

    // 2. Apply pre-generated template (fast bulk insert)
    await applyDemoTemplate({ userId: user.id });

    // 3. Sign in using better-auth's API to get proper session with signed cookies
    // Pass asResponse: true to get a full Response object with Set-Cookie headers
    const signInResponse = await auth.api.signInEmail({
      body: {
        email,
        password,
        rememberMe: false, // Demo sessions are short-lived
      },
      headers: req.headers as unknown as Headers,
      asResponse: true,
    });

    logger.info(`Demo session created for user: ${user.id}`);

    // 4. Forward the Set-Cookie headers from better-auth response
    const setCookieHeaders = signInResponse.headers.getSetCookie() || [];
    for (const cookie of setCookieHeaders) {
      res.append('Set-Cookie', cookie);
    }

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: {
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
        },
      },
    });
  } catch (error) {
    logger.error({ message: 'Failed to start demo session', error: error as Error });
    return errorHandler(res, error as Error);
  }
};
