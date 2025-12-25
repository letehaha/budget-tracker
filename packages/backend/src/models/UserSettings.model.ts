import { AI_FEATURE, AI_PROVIDER } from '@bt/shared/types';
import { Table, Column, Model, ForeignKey, DataType, BelongsTo } from 'sequelize-typescript';
import Users from './Users.model';
import { z } from 'zod';

export const ZodAiApiKeySchema = z.object({
  provider: z.nativeEnum(AI_PROVIDER),
  keyEncrypted: z.string(),
  createdAt: z.string().datetime(),
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
