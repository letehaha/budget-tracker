import { SUPPORTED_LOCALES } from '@bt/shared/i18n/locales';
import { AI_FEATURE, AI_PROVIDER, NOTIFICATION_TYPES } from '@bt/shared/types';
import { Table, Column, Model, ForeignKey, DataType, BelongsTo } from 'sequelize-typescript';
import { z } from 'zod';

import Users from './Users.model';

const ZodAiApiKeyStatusSchema = z.enum(['valid', 'invalid']);

const ZodAiApiKeySchema = z.object({
  provider: z.nativeEnum(AI_PROVIDER),
  keyEncrypted: z.string(),
  createdAt: z.string().datetime(),
  status: ZodAiApiKeyStatusSchema.optional(),
  lastValidatedAt: z.string().datetime().optional(),
  lastError: z.string().optional(),
  invalidatedAt: z.string().datetime().optional(),
});

const ZodAiFeatureConfigSchema = z.object({
  feature: z.nativeEnum(AI_FEATURE),
  modelId: z.string(), // Format: 'provider/model', e.g., 'openai/gpt-4o'
});

const ZodAiSettingsSchema = z.object({
  apiKeys: z.array(ZodAiApiKeySchema).default([]),
  defaultProvider: z.nativeEnum(AI_PROVIDER).optional(),
  featureConfigs: z.array(ZodAiFeatureConfigSchema).default([]),
});

/**
 * Notification preferences per notification type.
 * Users can enable/disable specific notification types.
 */
const ZodNotificationPreferencesSchema = z.object({
  enabled: z.boolean().default(true),
  // Per-type preferences (all enabled by default)
  types: z.object({
    [NOTIFICATION_TYPES.budgetAlert]: z.boolean().default(true),
    [NOTIFICATION_TYPES.system]: z.boolean().default(true),
    [NOTIFICATION_TYPES.changelog]: z.boolean().default(true),
  }),
});

// Onboarding state schema for Quick Start feature
const ZodOnboardingStateSchema = z.object({
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

// Spike detection config keys that can appear in balance-trend widget config
const ZodSpikeConfigSchema = z.object({
  spikesEnabled: z.boolean().optional(),
  spikePercentThreshold: z.number().min(1).max(50).optional(),
  spikeAbsoluteThreshold: z.number().min(1).max(10000).optional(),
  spikeMaxCount: z.number().int().min(1).max(20).optional(),
});

const ZodDashboardWidgetSchema = z
  .object({
    widgetId: z.string(),
    colSpan: z.number().int().min(1).max(3).default(1),
    rowSpan: z.number().int().min(1).max(2).default(1),
    config: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((widget, ctx) => {
    if (!widget.config) return;

    // Validate spike config keys when present on any widget (only balance-trend
    // uses them, but the schema is widget-agnostic — unknown keys are ignored)
    const spikeKeys = Object.keys(ZodSpikeConfigSchema.shape);
    const hasSpikeKeys = spikeKeys.some((key) => key in widget.config!);

    if (hasSpikeKeys) {
      const result = ZodSpikeConfigSchema.safeParse(widget.config);
      if (!result.success) {
        for (const issue of result.error.issues) {
          ctx.addIssue({ ...issue, path: ['config', ...issue.path] });
        }
      }
    }
  });

const ZodDashboardSettingsSchema = z.object({
  widgets: z.array(ZodDashboardWidgetSchema).default([]),
});

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
  dashboard: ZodDashboardSettingsSchema.optional(),
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
  declare id: number;

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
  declare createdAt: Date;

  @Column({
    allowNull: false,
    type: DataType.DATE,
    defaultValue: DataType.NOW,
  })
  declare updatedAt: Date;
}
