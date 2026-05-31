import { logger } from '@js/utils/logger';
import type { SentryTraceData } from '@js/utils/sentry';
import { withQueueProcessSpan, withQueuePublishSpan } from '@js/utils/sentry';
import { connection } from '@models/index';
import PaymentReminderNotifications from '@models/payment-reminder-notifications.model';
import Users from '@models/users.model';
import { appName, appUrl, buildEmailShell, escapeHtml, fromEmail } from '@services/email';
import { sendEmail } from '@services/email/send-email';
import type { Job } from 'bullmq';
import { Queue, Worker } from 'bullmq';

interface ReminderEmailJobData extends SentryTraceData {
  userId: number;
  reminderId: string;
  periodId: string;
  reminderName: string;
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
  process.env.NODE_ENV === 'test' && (process.env.VITEST_POOL_ID || process.env.JEST_WORKER_ID)
    ? `payment-reminder-emails-worker-${process.env.VITEST_POOL_ID || process.env.JEST_WORKER_ID}`
    : 'payment-reminder-emails';

const reminderEmailQueue = new Queue<ReminderEmailJobData>(queueName, {
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

reminderEmailQueue.on('error', (err) => {
  if (!err.message.includes('Connection is closed')) {
    logger.error({ message: '[Payment Reminder Email Queue] Queue error', error: err });
  }
});

const reminderEmailWorker = new Worker<ReminderEmailJobData>(
  queueName,
  async (job: Job<ReminderEmailJobData>) => {
    return withQueueProcessSpan({
      queueName,
      job,
      fn: async () => {
        const { reminderName, dueDate, expectedAmount, currencyCode, reminderId } = job.data;

        // expectedAmount is already decimal (converted by model getter via Money.toJSON())
        const amountDisplay = expectedAmount != null && currencyCode ? `${expectedAmount} ${currencyCode}` : null;

        const deepLink = `${appUrl}/planned/reminders/${reminderId}`;

        const html = buildEmailHtml({ reminderName, dueDate, amountDisplay, deepLink });

        // Fetch user's email from better-auth table via authUserId
        const appUser = await Users.findByPk(job.data.userId, { attributes: ['authUserId'] });

        if (!appUser?.authUserId) {
          logger.warn(`[Payment Reminder Email] No authUserId found for user ${job.data.userId}`);
          return;
        }

        const [rows] = await connection.sequelize.query('SELECT email FROM ba_user WHERE id = :authUserId LIMIT 1', {
          replacements: { authUserId: appUser.authUserId },
        });
        const email = (rows as { email: string }[])[0]?.email;

        if (!email) {
          logger.warn(`[Payment Reminder Email] No email found for user ${job.data.userId}`);
          return;
        }

        const result = await sendEmail({
          from: `${appName} <${fromEmail}>`,
          to: email,
          subject: `Payment reminder: ${reminderName} due ${dueDate}`,
          html,
        });

        if (result) {
          logger.info(`[Payment Reminder Email] Sent email to user ${job.data.userId} for reminder "${reminderName}"`);
        }
      },
    });
  },
  {
    connection: redisConnection,
    concurrency: 3,
  },
);

reminderEmailWorker.on('completed', (job) => {
  logger.info(`[Payment Reminder Email] Job ${job.id} completed`);
});

reminderEmailWorker.on('failed', async (job, err) => {
  logger.error({ message: `[Payment Reminder Email] Job ${job?.id} failed`, error: err });

  // If permanently failed (exhausted retries), record the error
  if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
    try {
      await PaymentReminderNotifications.update(
        { emailError: err.message },
        {
          where: {
            periodId: job.data.periodId,
          },
        },
      );
    } catch (updateErr) {
      logger.error({
        message: '[Payment Reminder Email] Failed to update notification error',
        error: updateErr as Error,
      });
    }
  }
});

reminderEmailWorker.on('error', (err) => {
  if (!err.message.includes('Connection is closed')) {
    logger.error({ message: '[Payment Reminder Email] Worker error', error: err });
  }
});

/**
 * Queue a payment reminder email for sending.
 */
export async function queueReminderEmail(data: ReminderEmailJobData): Promise<string> {
  const jobId = `reminder-email-${data.reminderId}-${data.periodId}-${Date.now()}`;

  await withQueuePublishSpan({
    queueName,
    messageId: jobId,
    payloadSize: JSON.stringify(data).length,
    fn: async (traceData) => {
      await reminderEmailQueue.add(jobId, { ...data, ...traceData }, { jobId });
    },
  });

  logger.info(`[Payment Reminder Email] Queued email for user ${data.userId}, reminder "${data.reminderName}"`);

  return jobId;
}

function buildEmailHtml({
  reminderName,
  dueDate,
  amountDisplay,
  deepLink,
}: {
  reminderName: string;
  dueDate: string;
  amountDisplay: string | null;
  deepLink: string;
}): string {
  const safeAppName = escapeHtml(appName);
  const safeReminderName = escapeHtml(reminderName);
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
                  <td style="padding: 0 0 6px 0; font-size: 15px; color: #1a1a1a; text-align: right;"><strong>${safeReminderName}</strong></td>
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
              <p style="margin: 0; font-size: 13px; color: #9ca3af; line-height: 1.5;">You're receiving this because you enabled email notifications for this payment reminder in ${safeAppName}.</p>
            </td>
          </tr>`,
  });
}
