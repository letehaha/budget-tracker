import { SUPPORTED_LOCALES } from '@bt/shared/i18n/locales';
import {
  AI_CUSTOM_INSTRUCTIONS_MAX_LENGTH,
  AI_FEATURE,
  AI_PROVIDER,
  NOTIFICATION_TYPES,
  RecordId,
} from '@bt/shared/types';
import { Table, Column, Model, ForeignKey, DataType, BelongsTo } from 'sequelize-typescript';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';

import Users from './users.model';

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
  customInstructions: z.string().max(AI_CUSTOM_INSTRUCTIONS_MAX_LENGTH).optional(),
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

// Per-section visibility for the sidebar's Accounts panel. The "Bank Accounts"
// section is always visible and intentionally not configurable here.
const ZodSidebarSectionsSchema = z.object({
  portfolios: z.boolean().default(true),
  ventures: z.boolean().default(true),
  vehicles: z.boolean().default(true),
});

// Column ids are plain strings (not an enum) on purpose: the column set is a
// frontend concern and may grow without a backend deploy. Unknown ids are
// dropped client-side on read, so stale entries are harmless.
const ZodTransactionsTableSettingsSchema = z.object({
  /** Ordered list of column ids the user wants visible. */
  visibleColumns: z.array(z.string()).default([]),
  /** Full column order (visible + hidden) used by the column-config UI. */
  columnOrder: z.array(z.string()).default([]),
  /** Preferred transactions view on narrow screens: compact list or the full table. */
  mobileView: z.enum(['list', 'table']).optional(),
  /** Preferred transactions view on wide screens: compact list or the full table. */
  desktopView: z.enum(['list', 'table']).optional(),
  /**
   * Optional filters the user added to the transactions filter bar (besides the
   * always-visible ones). Plain strings for the same reason as column ids.
   */
  extraFilters: z.array(z.string()).optional(),
});

const ZodInvestmentTransactionsTableSettingsSchema = z.object({
  /** Ordered list of column ids the user wants visible. */
  visibleColumns: z.array(z.string()).default([]),
  /** Full column order (visible + hidden) used by the column-config UI. */
  columnOrder: z.array(z.string()).default([]),
});

// List-view-only preferences for /records (the table view has its own schema).
const ZodTransactionsListSettingsSchema = z.object({
  /** When true the pinned "Upcoming" section (overdue + due within 3 days) is
   *  suppressed from list view. Defaults to false (section visible). */
  hideUpcoming: z.boolean().optional(),
});

// UI-state preferences (table layouts, view modes). Functional settings keep
// their own top-level keys; this namespace is only for presentation state.
const ZodUiSettingsSchema = z.object({
  transactionsTable: ZodTransactionsTableSettingsSchema.optional(),
  transactionsList: ZodTransactionsListSettingsSchema.optional(),
  investmentTransactionsTable: ZodInvestmentTransactionsTableSettingsSchema.optional(),
});

// Subscription-related defaults. Currently only `defaultAutoRecord`, which seeds
// the auto-record toggle on the create-subscription form. The form still lets
// the user override it per subscription — this is only the default.
const ZodSubscriptionsSettingsSchema = z.object({
  defaultAutoRecord: z.boolean().optional(),
});

export const ZodSettingsSchema = z.object({
  locale: z
    .enum([SUPPORTED_LOCALES.ENGLISH, SUPPORTED_LOCALES.UKRAINIAN, SUPPORTED_LOCALES.SPANISH])
    .default(SUPPORTED_LOCALES.ENGLISH),
  ai: ZodAiSettingsSchema.optional(),
  notifications: ZodNotificationPreferencesSchema.optional(),
  onboarding: ZodOnboardingStateSchema.optional(),
  dashboard: ZodDashboardSettingsSchema.optional(),
  includeCreditLimitInStats: z.boolean().optional(),
  sidebarSections: ZodSidebarSectionsSchema.optional(),
  ui: ZodUiSettingsSchema.optional(),
  subscriptions: ZodSubscriptionsSettingsSchema.optional(),
  // When true, both the inline sync-time Payee extraction and the post-sync
  // note fuzzy backfill fall back to the transaction description/note if the
  // provider's dedicated merchant field is empty. Off by default — Monobank's
  // `counterName` is empty for most card purchases, so users have to opt in
  // to use `description` instead.
  payeeExtractionUsesDescription: z.boolean().optional(),
});

// Infer the TypeScript type from the Zod schema
export type SettingsSchema = z.infer<typeof ZodSettingsSchema>;

/**
 * Schema for the partial settings update (PATCH). Mirrors `ZodSettingsSchema`
 * but with every field optional and **no defaults** – a `.default([])` would be
 * injected for absent keys on parse and the deep-merge would then clobber
 * stored arrays with empty ones (zod's `.partial()` does not stop default
 * injection, so the full schema cannot be reused here). Same approach as
 * `ZodOnboardingStateUpdateSchema`. `onboarding` is intentionally absent – it
 * has its own endpoint.
 *
 * Arrays stay non-partial: the merge replaces them wholesale, so a patched
 * array is always the full desired list.
 */
export const ZodSettingsPatchSchema = z.object({
  locale: z.enum([SUPPORTED_LOCALES.ENGLISH, SUPPORTED_LOCALES.UKRAINIAN, SUPPORTED_LOCALES.SPANISH]).optional(),
  ai: z
    .object({
      apiKeys: z.array(ZodAiApiKeySchema).optional(),
      defaultProvider: z.enum(AI_PROVIDER).optional(),
      featureConfigs: z.array(ZodAiFeatureConfigSchema).optional(),
      customInstructions: z.string().max(AI_CUSTOM_INSTRUCTIONS_MAX_LENGTH).optional(),
    })
    .optional(),
  notifications: z
    .object({
      enabled: z.boolean().optional(),
      types: z
        .object({
          [NOTIFICATION_TYPES.budgetAlert]: z.boolean().optional(),
          [NOTIFICATION_TYPES.system]: z.boolean().optional(),
          [NOTIFICATION_TYPES.changelog]: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
  dashboard: z
    .object({
      widgets: z.array(ZodDashboardWidgetSchema).optional(),
    })
    .optional(),
  includeCreditLimitInStats: z.boolean().optional(),
  sidebarSections: z
    .object({
      portfolios: z.boolean().optional(),
      ventures: z.boolean().optional(),
      vehicles: z.boolean().optional(),
    })
    .optional(),
  ui: z
    .object({
      transactionsTable: z
        .object({
          visibleColumns: z.array(z.string()).optional(),
          columnOrder: z.array(z.string()).optional(),
          mobileView: z.enum(['list', 'table']).optional(),
          desktopView: z.enum(['list', 'table']).optional(),
          extraFilters: z.array(z.string()).optional(),
        })
        .optional(),
      transactionsList: z
        .object({
          hideUpcoming: z.boolean().optional(),
        })
        .optional(),
      investmentTransactionsTable: z
        .object({
          visibleColumns: z.array(z.string()).optional(),
          columnOrder: z.array(z.string()).optional(),
        })
        .optional(),
    })
    .optional(),
  subscriptions: z
    .object({
      defaultAutoRecord: z.boolean().optional(),
    })
    .optional(),
  payeeExtractionUsesDescription: z.boolean().optional(),
});

export type SettingsPatchSchema = z.infer<typeof ZodSettingsPatchSchema>;

/** Arrays stay non-partial – the PATCH merge replaces them wholesale. The
 * `NonNullable` keeps recursion working for optional properties. */
type DeepPartial<T> = {
  [K in keyof T]?: NonNullable<T[K]> extends (infer U)[]
    ? U[]
    : NonNullable<T[K]> extends object
      ? DeepPartial<NonNullable<T[K]>>
      : T[K];
};

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

/**
 * Compile-time drift guard: `ZodSettingsPatchSchema` must infer exactly the
 * deep-partial of the full settings schema (minus `onboarding`). When a field
 * is added to `ZodSettingsSchema` but not mirrored in the patch schema, this
 * line becomes a type error – without it the PATCH endpoint would silently
 * strip the new key from incoming patches.
 *
 * @public exported only so the assertion isn't flagged as unused – nothing
 * should import it.
 */
export type SettingsPatchSchemaIsInSync = Expect<
  Equals<SettingsPatchSchema, DeepPartial<Omit<SettingsSchema, 'onboarding'>>>
>;

export const DEFAULT_SETTINGS: SettingsSchema = {
  locale: SUPPORTED_LOCALES.ENGLISH,
  includeCreditLimitInStats: false,
};

@Table({
  tableName: 'UserSettings',
  freezeTableName: true,
  timestamps: true, // To include `createdAt` and `updatedAt`
})
export default class UserSettings extends Model {
  @Column({
    primaryKey: true,
    allowNull: false,
    type: DataType.UUID,
    defaultValue: () => uuidv7(),
  })
  declare id: RecordId;

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
