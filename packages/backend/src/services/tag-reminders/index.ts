import { TAG_REMINDER_TYPES, TagReminderFrequency, TagReminderSettings, TagReminderType } from '@bt/shared/types';
import { t } from '@i18n/index';
import { ConflictError, NotFoundError, ValidationError } from '@js/errors';
import { logger } from '@js/utils/logger';
import TagReminders from '@models/TagReminders.model';
import Tags from '@models/Tags.model';
import { withTransaction } from '@services/common/with-transaction';
import { Op } from 'sequelize';

const MAX_REMINDERS_PER_USER = 50;

interface CreateReminderPayload {
  userId: number;
  tagId: number;
  type: TagReminderType;
  frequency?: TagReminderFrequency | null; // `null` for realtime
  dayOfMonth?: number | null;
  settings?: TagReminderSettings;
  isEnabled?: boolean;
}

export const createReminder = withTransaction(async (payload: CreateReminderPayload) => {
  const { userId, tagId, type, frequency = null, dayOfMonth = null, settings = {}, isEnabled = true } = payload;

  // Verify tag exists and belongs to user
  const tag = await Tags.findOne({
    where: { id: tagId, userId },
  });

  if (!tag) {
    throw new NotFoundError({ message: t({ key: 'tags.tagNotFound' }) });
  }

  // Check 50 reminder limit per user
  const userReminderCount = await TagReminders.count({ where: { userId } });
  if (userReminderCount >= MAX_REMINDERS_PER_USER) {
    throw new ValidationError({
      message: t({ key: 'tagReminders.maxRemindersReached' }),
    });
  }

  // Check if amountThreshold is required for amount_threshold type
  const amountThreshold = (settings as { amountThreshold?: number }).amountThreshold;
  if (type === TAG_REMINDER_TYPES.amountThreshold && !amountThreshold) {
    throw new ValidationError({
      message: t({ key: 'tagReminders.amountThresholdRequired' }),
    });
  }

  // Check for exact duplicate (same tag/type/frequency/dayOfMonth/settings)
  const existingReminder = await TagReminders.findOne({
    where: {
      tagId,
      type,
      frequency: frequency ?? null,
      dayOfMonth: dayOfMonth ?? null,
      settings: settings ?? {},
    },
  });

  if (existingReminder) {
    throw new ConflictError({
      message: t({ key: 'tagReminders.reminderAlreadyExists' }),
    });
  }

  const reminder = await TagReminders.create({
    userId,
    tagId,
    type,
    frequency,
    dayOfMonth,
    settings: type === TAG_REMINDER_TYPES.amountThreshold ? { amountThreshold } : settings,
    isEnabled,
  });

  return reminder;
});

interface GetRemindersForTagPayload {
  userId: number;
  tagId: number;
}

export const getRemindersForTag = async ({ userId, tagId }: GetRemindersForTagPayload) => {
  // Verify tag exists and belongs to user
  const tag = await Tags.findOne({
    where: { id: tagId, userId },
  });

  if (!tag) {
    throw new NotFoundError({ message: t({ key: 'tags.tagNotFound' }) });
  }

  const reminders = await TagReminders.findAll({
    where: { tagId, userId },
    order: [['createdAt', 'ASC']],
  });

  return reminders;
};

interface GetReminderByIdPayload {
  id: number;
  userId: number;
  tagId: number;
}

export const getReminderById = async ({ id, userId, tagId }: GetReminderByIdPayload) => {
  const reminder = await TagReminders.findOne({
    where: { id, userId, tagId },
    include: [{ model: Tags, as: 'tag' }],
  });

  if (!reminder) {
    throw new NotFoundError({ message: t({ key: 'tagReminders.reminderNotFound' }) });
  }

  return reminder;
};

interface GetAllRemindersPayload {
  userId: number;
}

export const getAllReminders = async ({ userId }: GetAllRemindersPayload) => {
  const reminders = await TagReminders.findAll({
    where: { userId },
    include: [{ model: Tags, as: 'tag' }],
    order: [['createdAt', 'ASC']],
  });

  return reminders;
};

interface UpdateReminderPayload {
  id: number;
  userId: number;
  tagId: number;
  type?: TagReminderType;
  frequency?: TagReminderFrequency | null;
  dayOfMonth?: number | null;
  settings?: TagReminderSettings;
  isEnabled?: boolean;
}

export const updateReminder = withTransaction(async (payload: UpdateReminderPayload) => {
  const { id, userId, tagId, type, frequency, dayOfMonth, settings, isEnabled } = payload;

  const reminder = await TagReminders.findOne({
    where: { id, userId, tagId },
  });

  if (!reminder) {
    throw new NotFoundError({ message: t({ key: 'tagReminders.reminderNotFound' }) });
  }

  const newType = type ?? reminder.type;
  const newFrequency = frequency !== undefined ? frequency : reminder.frequency;
  const newDayOfMonth = dayOfMonth !== undefined ? dayOfMonth : reminder.dayOfMonth;
  const newSettings = settings !== undefined ? settings : reminder.settings;

  // Check if amountThreshold is required for amount_threshold type
  const amountThreshold = (newSettings as { amountThreshold?: number }).amountThreshold;
  if (newType === TAG_REMINDER_TYPES.amountThreshold && !amountThreshold) {
    throw new ValidationError({
      message: t({ key: 'tagReminders.amountThresholdRequired' }),
    });
  }

  // Check for exact duplicate if any field is changing
  const hasChanges =
    type !== undefined || frequency !== undefined || dayOfMonth !== undefined || settings !== undefined;

  if (hasChanges) {
    const existingReminder = await TagReminders.findOne({
      where: {
        tagId: reminder.tagId,
        type: newType,
        frequency: newFrequency ?? null,
        dayOfMonth: newDayOfMonth ?? null,
        settings: newSettings ?? {},
        id: { [Op.ne]: id },
      },
    });

    if (existingReminder) {
      throw new ConflictError({
        message: t({ key: 'tagReminders.reminderAlreadyExists' }),
      });
    }
  }

  await reminder.update({
    ...(type !== undefined && { type }),
    ...(frequency !== undefined && { frequency }),
    ...(dayOfMonth !== undefined && { dayOfMonth }),
    ...(settings !== undefined && { settings }),
    ...(isEnabled !== undefined && { isEnabled }),
  });

  return reminder;
});

interface DeleteReminderPayload {
  id: number;
  userId: number;
  tagId: number;
}

export const deleteReminder = withTransaction(async ({ id, userId, tagId }: DeleteReminderPayload) => {
  const reminder = await TagReminders.findOne({
    where: { id, userId, tagId },
  });

  if (!reminder) {
    throw new NotFoundError({ message: t({ key: 'tagReminders.reminderNotFound' }) });
  }

  await reminder.destroy();

  return { success: true };
});

/**
 * Get all enabled scheduled reminders.
 * Used by the cron job to find reminders that need to be checked.
 */
export const getEnabledScheduledReminders = async () => {
  const reminders = await TagReminders.findAll({
    where: {
      isEnabled: true,
      frequency: { [Op.ne]: null },
    },
    include: [{ model: Tags, as: 'tag' }],
  });

  return reminders;
};

/**
 * Get all enabled real-time reminders for specific tags and user.
 * Used when transactions are tagged to check for real-time triggers.
 */
const getEnabledRealTimeRemindersForTags = async ({ tagIds, userId }: { tagIds: number[]; userId: number }) => {
  if (tagIds.length === 0) return [];

  const reminders = await TagReminders.findAll({
    where: {
      tagId: { [Op.in]: tagIds },
      userId,
      isEnabled: true,
      frequency: null,
    },
    include: [{ model: Tags, as: 'tag' }],
  });

  return reminders;
};

interface UpdateReminderCheckTimesPayload {
  id: number;
  lastCheckedAt: Date;
  lastTriggeredAt?: Date | null;
}

/**
 * Update the check/trigger timestamps for a reminder.
 * Used by the cron job after processing a reminder.
 */
export const updateReminderCheckTimes = async ({
  id,
  lastCheckedAt,
  lastTriggeredAt,
}: UpdateReminderCheckTimesPayload) => {
  const reminder = await TagReminders.findByPk(id);

  if (!reminder) {
    throw new NotFoundError({ message: t({ key: 'tagReminders.reminderNotFound' }) });
  }

  await reminder.update({
    lastCheckedAt,
    ...(lastTriggeredAt !== undefined && { lastTriggeredAt }),
  });

  return reminder;
};

/**
 * Trigger real-time reminders check for specific tags and user.
 * Non-blocking - errors are logged but don't propagate.
 * Called when transactions are tagged (during create, update, or addTransactionsToTag).
 */
export const triggerRealTimeRemindersForTags = async ({
  tagIds,
  userId,
}: {
  tagIds: number[];
  userId: number;
}): Promise<void> => {
  if (tagIds.length === 0) {
    return;
  }

  try {
    const reminders = await getEnabledRealTimeRemindersForTags({ tagIds, userId });

    if (reminders.length > 0) {
      // Dynamic import to avoid circular dependency
      const { checkRealTimeReminders } = await import('./check-reminders');
      const result = await checkRealTimeReminders({ reminders });

      if (result.triggered > 0) {
        logger.info(`Real-time reminders triggered for tags [${tagIds.join(', ')}]`, {
          triggered: result.triggered,
          skipped: result.skipped,
        });
      }
    }
  } catch (error) {
    logger.error({
      message: 'Failed to trigger real-time reminders',
      error: error as Error,
    });
  }
};

export { registerTagReminderListeners } from './event-listeners';
