import { AI_FEATURE, AI_PROVIDER } from '@bt/shared/types';
import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from '@sequelize/core';
import {
  Attribute,
  AutoIncrement,
  BelongsTo,
  Default,
  Index,
  NotNull,
  PrimaryKey,
  Table,
  Unique,
} from '@sequelize/core/decorators-legacy';
import { z } from 'zod';

import Users from './Users.model';

export const ZodAiApiKeyStatusSchema = z.enum(['valid', 'invalid']);

export const ZodAiApiKeySchema = z.object({
  provider: z.nativeEnum(AI_PROVIDER),
  keyEncrypted: z.string(),
  createdAt: z.string().datetime(),
  status: ZodAiApiKeyStatusSchema,
  lastValidatedAt: z.string().datetime(),
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

export const ZodSettingsSchema = z.object({
  stats: z.object({
    expenses: z.object({
      excludedCategories: z.array(z.number().int().positive().finite()),
    }),
  }),
  ai: ZodAiSettingsSchema.optional(),
});

export const DEFAULT_SETTINGS: SettingsSchema = {
  stats: {
    expenses: {
      excludedCategories: [],
    },
  },
};

// Infer the TypeScript type from the Zod schema
export type SettingsSchema = z.infer<typeof ZodSettingsSchema>;

@Table({
  tableName: 'UserSettings',
  freezeTableName: true,
  timestamps: true, // To include `createdAt` and `updatedAt`
})
export default class UserSettings extends Model<InferAttributes<UserSettings>, InferCreationAttributes<UserSettings>> {
  @Attribute(DataTypes.INTEGER)
  @PrimaryKey
  @AutoIncrement
  @Unique
  declare id: CreationOptional<number>;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Index
  declare userId: number;

  @BelongsTo(() => Users, 'userId')
  declare user?: NonAttribute<Users>;

  @Attribute(DataTypes.JSONB)
  @NotNull
  @Default(DEFAULT_SETTINGS)
  declare settings: CreationOptional<SettingsSchema>;

  @Attribute(DataTypes.DATE)
  @NotNull
  @Default(DataTypes.NOW)
  declare createdAt: CreationOptional<Date>;

  @Attribute(DataTypes.DATE)
  @NotNull
  @Default(DataTypes.NOW)
  declare updatedAt: CreationOptional<Date>;
}
