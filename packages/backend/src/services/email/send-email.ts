import { isTestEmail } from '@bt/shared/types';
import { EnvVar, isEnvConfigured } from '@common/utils/env';
import { logger } from '@js/utils/logger';
import { Resend } from 'resend';

const resend = isEnvConfigured(EnvVar.RESEND_API_KEY, process.env.RESEND_API_KEY)
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

type SendEmailPayload = {
  from: string;
  to: string;
  subject: string;
  html: string;
};

type SendEmailResult = Awaited<ReturnType<NonNullable<typeof resend>['emails']['send']>> | null;

export async function sendEmail(payload: SendEmailPayload): Promise<SendEmailResult> {
  if (!resend) {
    logger.warn(`[Email] Skipped (RESEND_API_KEY not configured): "${payload.subject}" -> ${payload.to}`);
    return null;
  }
  if (isTestEmail(payload.to)) {
    logger.info(`[Email] Skipped (test recipient): "${payload.subject}" -> ${payload.to}`);
    return null;
  }
  return resend.emails.send(payload);
}
