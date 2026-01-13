/**
 * TagReminders Serializers
 *
 * Handles conversion between internal cents representation and API decimal format
 * for the amountThreshold field in reminder settings.
 * - Serializers: DB (cents) → API (decimal)
 * - Deserializers: API (decimal) → DB (cents)
 */
import {
  type CentsAmount,
  type DecimalAmount,
  type TagReminderFrequency,
  type TagReminderSettings,
  type TagReminderType,
  asCents,
  parseToCents,
  toDecimal,
} from '@bt/shared/types';
import type TagReminders from '@models/TagReminders.model';

// ============================================================================
// Response Types (API format with DecimalAmount)
// ============================================================================

export interface TagReminderSettingsApiResponse {
  amountThreshold?: DecimalAmount;
  [key: string]: unknown;
}

export interface TagReminderApiResponse {
  id: number;
  userId: number;
  tagId: number;
  type: string;
  frequency: string | null;
  dayOfMonth: number | null;
  settings: TagReminderSettingsApiResponse;
  isEnabled: boolean;
  lastCheckedAt: Date | null;
  lastTriggeredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Request Types (API format with decimal input)
// ============================================================================

export interface CreateTagReminderRequest {
  type: TagReminderType;
  frequency?: TagReminderFrequency | null;
  dayOfMonth?: number | null;
  settings?: {
    amountThreshold?: number; // decimal from API
    [key: string]: unknown;
  };
  isEnabled?: boolean;
}

export interface UpdateTagReminderRequest {
  type?: TagReminderType;
  frequency?: TagReminderFrequency | null;
  dayOfMonth?: number | null;
  settings?: {
    amountThreshold?: number; // decimal from API
    [key: string]: unknown;
  };
  isEnabled?: boolean;
}

// ============================================================================
// Internal Types (DB format with CentsAmount)
// ============================================================================

export interface TagReminderSettingsInternal {
  amountThreshold?: CentsAmount;
  [key: string]: unknown;
}

export interface CreateTagReminderInternal {
  type: TagReminderType;
  frequency?: TagReminderFrequency | null;
  dayOfMonth?: number | null;
  settings?: TagReminderSettingsInternal;
  isEnabled?: boolean;
}

export interface UpdateTagReminderInternal {
  type?: TagReminderType;
  frequency?: TagReminderFrequency | null;
  dayOfMonth?: number | null;
  settings?: TagReminderSettingsInternal;
  isEnabled?: boolean;
}

// ============================================================================
// Serializers (DB → API)
// ============================================================================

/**
 * Serialize settings, converting amountThreshold from cents to decimal
 */
function serializeSettings(settings: TagReminderSettings): TagReminderSettingsApiResponse {
  const settingsObj = settings as { amountThreshold?: number; [key: string]: unknown };

  if (settingsObj.amountThreshold !== undefined) {
    return {
      ...settingsObj,
      amountThreshold: toDecimal(asCents(settingsObj.amountThreshold)),
    } as TagReminderSettingsApiResponse;
  }

  return settingsObj as TagReminderSettingsApiResponse;
}

/**
 * Serialize a tag reminder from DB format to API response
 */
export function serializeTagReminder(reminder: TagReminders): TagReminderApiResponse {
  return {
    id: reminder.id,
    userId: reminder.userId,
    tagId: reminder.tagId,
    type: reminder.type,
    frequency: reminder.frequency,
    dayOfMonth: reminder.dayOfMonth,
    settings: serializeSettings(reminder.settings),
    isEnabled: reminder.isEnabled,
    lastCheckedAt: reminder.lastCheckedAt,
    lastTriggeredAt: reminder.lastTriggeredAt,
    createdAt: reminder.createdAt,
    updatedAt: reminder.updatedAt,
  };
}

/**
 * Serialize multiple tag reminders
 */
export function serializeTagReminders(reminders: TagReminders[]): TagReminderApiResponse[] {
  return reminders.map(serializeTagReminder);
}

// ============================================================================
// Deserializers (API → DB)
// ============================================================================

/**
 * Deserialize settings, converting amountThreshold from decimal to cents
 */
function deserializeSettings(settings?: CreateTagReminderRequest['settings']): TagReminderSettingsInternal | undefined {
  if (!settings) return undefined;

  const { amountThreshold, ...rest } = settings;

  if (amountThreshold !== undefined) {
    return {
      ...rest,
      amountThreshold: parseToCents(amountThreshold),
    } as TagReminderSettingsInternal;
  }

  return settings as TagReminderSettingsInternal;
}

/**
 * Deserialize a create tag reminder request from API decimal format to internal cents format
 */
export function deserializeCreateTagReminder(req: CreateTagReminderRequest): CreateTagReminderInternal {
  return {
    type: req.type,
    frequency: req.frequency,
    dayOfMonth: req.dayOfMonth,
    settings: deserializeSettings(req.settings),
    isEnabled: req.isEnabled,
  };
}

/**
 * Deserialize an update tag reminder request from API decimal format to internal cents format
 */
export function deserializeUpdateTagReminder(req: UpdateTagReminderRequest): UpdateTagReminderInternal {
  return {
    type: req.type,
    frequency: req.frequency,
    dayOfMonth: req.dayOfMonth,
    settings: deserializeSettings(req.settings),
    isEnabled: req.isEnabled,
  };
}
