import { AI_FEATURE, AI_PROVIDER, NOTIFICATION_TYPES } from '@bt/shared/types';
import { SUPPORTED_LOCALES } from '@bt/shared/i18n/locales';
import { Table, Column, Model, ForeignKey, DataType, BelongsTo } from 'sequelize-typescript';
import Users from './Users.model';
import { z } from 'zod';

export const ZodAiApiKeyStatusSchema = z.enum(['valid', 'invalid']);

export const ZodAiApiKeySchema = z.object({
  provider: z.nativeEnum(AI_PROVIDER),
  keyEncrypted: z.string(),
  createdAt: z.string().datetime(),
  status: ZodAiApiKeyStatusSchema.optional(),
  lastValidatedAt: z.string().datetime().optional(),
  lastError: z.string().optional(),
  invalidatedAt: z.string().datetime().optional(),
});

export const ZodAiFeatureConfigSchema = z.object({
  feature: z.nativeEnum(AI_FEATURE),
  modelId: z.string(), // Format: 'provider/model', e.g., 'openai/gpt-4o'
});

export const ZodAiSettingsSchema = z.object({
  apiKeys: z.array(ZodAiApiKeySchema).default([]),
  defaultProvider: z.nativeEnum(AI_PROVIDER).optional(),
  featureConfigs: z.array(ZodAiFeatureConfigSchema).default([]),
});

/**
 * Notification preferences per notification type.
 * Users can enable/disable specific notification types.
 */
export const ZodNotificationPreferencesSchema = z.object({
  enabled: z.boolean().default(true),
  // Per-type preferences (all enabled by default)
  types: z
    .object({
      [NOTIFICATION_TYPES.budgetAlert]: z.boolean().default(true),
      [NOTIFICATION_TYPES.system]: z.boolean().default(true),
      [NOTIFICATION_TYPES.changelog]: z.boolean().default(true),
    }),
});

// Onboarding state schema for Quick Start feature
export const ZodOnboardingStateSchema = z.object({
  completedTasks: z.array(z.string()).default([]),
  isDismissed: z.boolean().default(false),
  dismissedAt: z.string().datetime().nullable().default(null),
});

// Schema for partial updates - no defaults so only provided fields are included
export const ZodOnboardingStateUpdateSchema = z.object({
  completedTasks: z.array(z.string()).optional(),
  isDismissed: z.boolean().optional(),
  dismissedAt: z.string().datetime().nullable().optional(),
});

export type OnboardingStateSchema = z.infer<typeof ZodOnboardingStateSchema>;

export const DEFAULT_ONBOARDING_STATE: OnboardingStateSchema = {
  completedTasks: [],
  isDismissed: false,
  dismissedAt: null,
};

export const DEFAULT_NOTIFICATION_PREFERENCES = {
  enabled: true,
  types: {
    [NOTIFICATION_TYPES.budgetAlert]: true,
    [NOTIFICATION_TYPES.system]: true,
    [NOTIFICATION_TYPES.changelog]: true,
  },
};

export const ZodSettingsSchema = z.object({
  locale: z.enum([SUPPORTED_LOCALES.ENGLISH, SUPPORTED_LOCALES.UKRAINIAN]).default(SUPPORTED_LOCALES.ENGLISH),
  stats: z.object({
    expenses: z.object({
      excludedCategories: z.array(z.number().int().positive().finite()),
    }),
  }),
  ai: ZodAiSettingsSchema.optional(),
  notifications: ZodNotificationPreferencesSchema.optional(),
  onboarding: ZodOnboardingStateSchema.optional(),
});

// Infer the TypeScript type from the Zod schema
export type SettingsSchema = z.infer<typeof ZodSettingsSchema>;

export const DEFAULT_SETTINGS: SettingsSchema = {
  locale: SUPPORTED_LOCALES.ENGLISH,
  stats: {
    expenses: {
      excludedCategories: [],
    },
  },
};

@Table({
  tableName: 'UserSettings',
  freezeTableName: true,
  timestamps: true, // To include `createdAt` and `updatedAt`
})
export default class UserSettings extends Model {
  @Column({
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    unique: true,
    type: DataType.INTEGER,
  })
  id!: number;

  @ForeignKey(() => Users)
  @Column({
    allowNull: false,
    type: DataType.INTEGER,
  })
  userId!: number;

  @BelongsTo(() => Users)
  user!: Users;

  @Column({
    type: DataType.JSONB,
    allowNull: false,
    defaultValue: DEFAULT_SETTINGS,
  })
  settings!: SettingsSchema;

  @Column({
    allowNull: false,
    type: DataType.DATE,
    defaultValue: DataType.NOW,
  })
  createdAt!: Date;

  @Column({
    allowNull: false,
    type: DataType.DATE,
    defaultValue: DataType.NOW,
  })
  updatedAt!: Date;
}
