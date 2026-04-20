import { logger } from '@js/utils/logger';
import { shutdownPostHog } from '@js/utils/posthog';

import { demoCleanupCron } from './crons/demo-cleanup';
import { demoTemplateRefreshCron } from './crons/demo-template-refresh';
import { loadCurrencyRatesJob } from './crons/exchange-rates';
import { paymentRemindersCron } from './crons/payment-reminders-check';
import { securitiesDailySyncCron } from './crons/securities-daily-sync';
import { subscriptionCandidateDetectionCron } from './crons/subscription-candidate-detection';
import { tagRemindersCron } from './crons/tag-reminders-check';
import { initializeHistoricalRates } from './services/exchange-rates/initialize-historical-rates.service';

export function initializeBackgroundJobs() {
  const isOfflineMode = process.env.OFFLINE_MODE === 'true';
  const isTestMode = process.env.NODE_ENV === 'test';

  if (isOfflineMode || isTestMode) {
    logger.info(`[${isTestMode ? 'Test' : 'Offline'} Mode] Skipping background jobs that require internet connection`);
  } else {
    // Initialize historical exchange rates on startup (non-blocking)
    initializeHistoricalRates();

    loadCurrencyRatesJob.start();

    // Demo cleanup and template refresh run in all environments (dev and prod)
    demoCleanupCron.startCron();
    demoTemplateRefreshCron.startCron();

    if (process.env.NODE_ENV === 'production') {
      securitiesDailySyncCron.startCron();
      tagRemindersCron.startCron();
      paymentRemindersCron.startCron();
      subscriptionCandidateDetectionCron.startCron();
    }
  }
}

export async function shutdownBackgroundJobs() {
  demoCleanupCron.stopCron();
  demoTemplateRefreshCron.stopCron();
  securitiesDailySyncCron.stopCron();
  tagRemindersCron.stopCron();
  subscriptionCandidateDetectionCron.stopCron();
  loadCurrencyRatesJob.stop();
  // Flush remaining PostHog events before exit
  await shutdownPostHog();
}
