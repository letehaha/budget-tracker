import { logger } from '@js/utils/logger';
import { SentryTraceData, withQueueProcessSpan, withQueuePublishSpan } from '@js/utils/sentry';
import { connection } from '@models/index';
import SubscriptionPeriodNotifications from '@models/subscription-period-notifications.model';
import Users from '@models/users.model';
import { appName, appUrl, buildEmailShell, escapeHtml, fromEmail } from '@services/email';
import { sendEmail } from '@services/email/send-email';
import { Job, Queue, Worker } from 'bullmq';

interface SubscriptionReminderEmailJobData extends SentryTraceData {
  userId: number;
  subscriptionId: string;
  periodId: string;
  remindBeforePreset: string;
  subscriptionName: string;
  dueDate: string;
  expectedAmount: number | null;
  currencyCode: string | null;
}

// Redis connection configuration for BullMQ
const redisConnection = {
  host: process.env.APPLICATION_REDIS_HOST,
  maxRetriesPerRequest: null as null,
  connectTimeout: 20000,
  keepAlive: 10000,
  retryStrategy: (times: number) => Math.min(times * 100, 3000),
};

// Namespace queue by Jest worker ID in test environment
const queueName =
  process.env.NODE_ENV === 'test' && process.env.JEST_WORKER_ID
    ? `subscription-reminder-emails-worker-${process.env.JEST_WORKER_ID}`
    : 'subscription-reminder-emails';

export const subscriptionReminderEmailQueue = new Queue<SubscriptionReminderEmailJobData>(queueName, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 60000,
    },
    removeOnComplete: true,
    removeOnFail: {
      age: 3600,
    },
  },
});

subscriptionReminderEmailQueue.on('error', (err) => {
  if (!err.message.includes('Connection is closed')) {
    logger.error({ message: '[Subscription Reminder Email Queue] Queue error', error: err });
  }
});

export const subscriptionReminderEmailWorker = new Worker<SubscriptionReminderEmailJobData>(
  queueName,
  async (job: Job<SubscriptionReminderEmailJobData>) => {
    return withQueueProcessSpan({
      queueName,
      job,
      fn: async () => {
        const { subscriptionName, dueDate, expectedAmount, currencyCode, subscriptionId } = job.data;

        // expectedAmount is already decimal (converted by caller before queuing)
        const amountDisplay = expectedAmount != null && currencyCode ? `${expectedAmount} ${currencyCode}` : null;

        const deepLink = `${appUrl}/planned/subscriptions/${subscriptionId}`;

        const html = buildEmailHtml({ subscriptionName, dueDate, amountDisplay, deepLink });

        // Fetch user's email from better-auth table via authUserId
        const appUser = await Users.findByPk(job.data.userId, { attributes: ['authUserId'] });

        if (!appUser?.authUserId) {
          logger.warn(`[Subscription Reminder Email] No authUserId found for user ${job.data.userId}`);
          return;
        }

        const [rows] = await connection.sequelize.query('SELECT email FROM ba_user WHERE id = :authUserId LIMIT 1', {
          replacements: { authUserId: appUser.authUserId },
        });
        const email = (rows as { email: string }[])[0]?.email;

        if (!email) {
          logger.warn(`[Subscription Reminder Email] No email found for user ${job.data.userId}`);
          return;
        }

        const result = await sendEmail({
          from: `${appName} <${fromEmail}>`,
          to: email,
          subject: `Payment reminder: ${subscriptionName} due ${dueDate}`,
          html,
        });

        // The Resend SDK resolves (it does not throw) with `{ data, error }` on API
        // failures — invalid recipient, rate limit, unverified domain, etc. — and
        // the resolved object is always truthy. Throwing here surfaces that as a
        // job failure so BullMQ retries it; the dedup row stays `emailSent: false`
        // until a later attempt succeeds. `sendEmail` returns `null` for the
        // intentional no-op (unconfigured key / test recipient), which is treated
        // as delivered below.
        if (result?.error) {
          throw new Error(`Resend send failed: ${result.error.name} - ${result.error.message}`);
        }

        if (result) {
          logger.info(
            `[Subscription Reminder Email] Sent email to user ${job.data.userId} for subscription "${subscriptionName}"`,
          );
        }

        // The worker is the source of truth for delivery: only after a send that
        // either succeeded (`result.data`, no error) or was an intentional no-op
        // (`result === null`) do we flip the dedup row to `emailSent: true`. This
        // scopes by (periodId, remindBeforePreset) so sibling presets for the same
        // period are untouched. A retry-exhausted job never reaches this point, so
        // the row keeps `emailSent: false` and the next cron run re-queues it.
        await SubscriptionPeriodNotifications.update(
          { emailSent: true, emailError: null },
          {
            where: {
              periodId: job.data.periodId,
              remindBeforePreset: job.data.remindBeforePreset,
            },
          },
        );
      },
    });
  },
  {
    connection: redisConnection,
    concurrency: 3,
  },
);

subscriptionReminderEmailWorker.on('completed', (job) => {
  logger.info(`[Subscription Reminder Email] Job ${job.id} completed`);
});

subscriptionReminderEmailWorker.on('failed', async (job, err) => {
  logger.error({ message: `[Subscription Reminder Email] Job ${job?.id} failed`, error: err });

  // Once retries are exhausted, record the error on the exact (periodId,
  // remindBeforePreset) dedup row. A period can have one row per preset (unique
  // constraint), so scoping by periodId alone would clobber a sibling preset's
  // state. `emailSent` is left as-is (false): the worker only flips it on a
  // successful send, so the next cron run re-queues this email.
  if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
    try {
      await SubscriptionPeriodNotifications.update(
        { emailError: err.message },
        {
          where: {
            periodId: job.data.periodId,
            remindBeforePreset: job.data.remindBeforePreset,
          },
        },
      );
    } catch (updateErr) {
      logger.error({
        message: '[Subscription Reminder Email] Failed to update notification error',
        error: updateErr as Error,
      });
    }
  }
});

subscriptionReminderEmailWorker.on('error', (err) => {
  if (!err.message.includes('Connection is closed')) {
    logger.error({ message: '[Subscription Reminder Email] Worker error', error: err });
  }
});

/**
 * Queue a subscription payment reminder email for sending.
 */
export async function queueSubscriptionReminderEmail(data: SubscriptionReminderEmailJobData): Promise<string> {
  // The timestamp makes each enqueue a fresh job: a cron run that finds the dedup
  // row still `emailSent: false` (e.g. a previous send exhausted retries) must be
  // able to re-queue, so jobs are deliberately not deduped by id.
  const jobId = `subscription-reminder-email-${data.subscriptionId}-${data.periodId}-${data.remindBeforePreset}-${Date.now()}`;

  await withQueuePublishSpan({
    queueName,
    messageId: jobId,
    payloadSize: JSON.stringify(data).length,
    fn: async (traceData) => {
      await subscriptionReminderEmailQueue.add(jobId, { ...data, ...traceData }, { jobId });
    },
  });

  logger.info(
    `[Subscription Reminder Email] Queued email for user ${data.userId}, subscription "${data.subscriptionName}"`,
  );

  return jobId;
}

function buildEmailHtml({
  subscriptionName,
  dueDate,
  amountDisplay,
  deepLink,
}: {
  subscriptionName: string;
  dueDate: string;
  amountDisplay: string | null;
  deepLink: string;
}): string {
  const safeAppName = escapeHtml(appName);
  const safeSubscriptionName = escapeHtml(subscriptionName);
  const safeDueDate = escapeHtml(dueDate);
  const safeDeepLink = escapeHtml(deepLink);
  const amountLine = amountDisplay
    ? `<tr><td style="padding: 0 0 6px 0; font-size: 15px; color: #6b7280;">Amount</td><td style="padding: 0 0 6px 0; font-size: 15px; color: #1a1a1a; text-align: right;"><strong>${escapeHtml(amountDisplay)}</strong></td></tr>`
    : '';

  return buildEmailShell({
    innerHtml: `
          <tr>
            <td style="padding: 28px 40px 0 40px;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #1a1a1a; line-height: 1.3;">Payment Reminder</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
                <tr>
                  <td style="padding: 0 0 6px 0; font-size: 15px; color: #6b7280;">Name</td>
                  <td style="padding: 0 0 6px 0; font-size: 15px; color: #1a1a1a; text-align: right;"><strong>${safeSubscriptionName}</strong></td>
                </tr>
                <tr>
                  <td style="padding: 0 0 6px 0; font-size: 15px; color: #6b7280;">Due date</td>
                  <td style="padding: 0 0 6px 0; font-size: 15px; color: #1a1a1a; text-align: right;"><strong>${safeDueDate}</strong></td>
                </tr>
                ${amountLine}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 40px 0 40px;">
              <a href="${safeDeepLink}" style="display: inline-block; background-color: #8b5cf6; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">View in App</a>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 40px 36px 40px;">
              <p style="margin: 0; font-size: 13px; color: #9ca3af; line-height: 1.5;">You're receiving this because you enabled email notifications for this subscription in ${safeAppName}.</p>
            </td>
          </tr>`,
  });
}
