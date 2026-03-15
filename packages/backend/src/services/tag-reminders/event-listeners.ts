import { logger } from '@js/utils/logger';
import { DOMAIN_EVENTS, TransactionsTaggedPayload, eventBus } from '@services/common/event-bus';
import debounce from 'lodash/debounce';

import { triggerRealTimeRemindersForTags } from './index';

const DEBOUNCE_DELAY_MS = 10_000; // 10 seconds
const MAX_WAIT_MS = 30_000; // 30 seconds max wait to prevent indefinite delays

/**
 * Pending tag IDs grouped by userId for proper data isolation.
 * Using a Map ensures reminders are checked per-user.
 */
const pendingTagIdsByUser = new Map<number, Set<number>>();

/**
 * Process accumulated tag IDs and trigger reminder checks per user.
 * Debounced to batch multiple events and ensure DB transactions have committed.
 */
const processTagReminders = debounce(
  async () => {
    // Copy and clear pending data atomically
    const usersToProcess = new Map(pendingTagIdsByUser);
    pendingTagIdsByUser.clear();

    if (usersToProcess.size === 0) {
      return;
    }

    // Process each user's reminders independently
    for (const [userId, tagIds] of usersToProcess) {
      const tagIdsArray = Array.from(tagIds);
      if (tagIdsArray.length === 0) continue;

      try {
        await triggerRealTimeRemindersForTags({ tagIds: tagIdsArray, userId });
      } catch (error) {
        logger.error(
          {
            message: 'Failed to trigger real-time reminders after transactions tagged',
            error: error as Error,
          },
          {
            userId,
            tagIds: tagIdsArray,
          },
        );
      }
    }
  },
  DEBOUNCE_DELAY_MS,
  { maxWait: MAX_WAIT_MS },
);

/**
 * Register tag reminder event listeners.
 * Call this once on app startup.
 */
export function registerTagReminderListeners(): void {
  eventBus.on(DOMAIN_EVENTS.TRANSACTIONS_TAGGED, handleTransactionsTagged);
  logger.info('Tag reminder event listeners registered');
}

/**
 * Handle transactions tagged event - accumulate tag IDs per user and trigger debounced processing.
 */
function handleTransactionsTagged(payload: TransactionsTaggedPayload): void {
  const { tagIds, userId } = payload;

  if (tagIds.length === 0) {
    return;
  }

  // Get or create the Set for this user
  let userTagIds = pendingTagIdsByUser.get(userId);
  if (!userTagIds) {
    userTagIds = new Set<number>();
    pendingTagIdsByUser.set(userId, userTagIds);
  }

  // Accumulate tag IDs for this user
  for (const tagId of tagIds) {
    userTagIds.add(tagId);
  }

  processTagReminders();
}
