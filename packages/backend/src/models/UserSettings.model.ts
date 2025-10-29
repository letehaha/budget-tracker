import { Table, Column, Model, ForeignKey, DataType, BelongsTo } from 'sequelize-typescript';
import Users from './Users.model';
import { z } from 'zod';

export const ZodSettingsSchema = z.object({
  stats: z.object({
    expenses: z.object({
      excludedCategories: z.array(z.number().int().positive().finite()),
    }),
  }),
  lunchflow: z
    .object({
      apiToken: z.string().optional(), // Encrypted API token
    })
    .optional(),
});

export const DEFAULT_SETTINGS: SettingsSchema = {
  stats: {
    expenses: {
      excludedCategories: [],
    },
  },
  lunchflow: undefined,
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
