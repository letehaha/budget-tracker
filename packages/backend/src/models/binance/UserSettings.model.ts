import { Table, Column, Model, ForeignKey, DataType } from 'sequelize-typescript';
import Users from '../Users.model';
import { UnwrapArray } from '@common/types';

@Table({
  timestamps: false,
  tableName: 'BinanceUserSettings',
  freezeTableName: true,
})
export default class BinanceUserSettings extends Model {
  @Column({
    unique: true,
    allowNull: false,
    autoIncrement: true,
    primaryKey: true,
    type: DataType.INTEGER,
  })
  declare id: number;

  @Column({ allowNull: false, type: DataType.STRING })
  apiKey!: string;

  @Column({ allowNull: false, type: DataType.STRING })
  secretKey!: string;

  @ForeignKey(() => Users)
  @Column({ allowNull: false, type: DataType.NUMBER })
  userId!: number;
}

export const getByUserId = async ({ userId }) => {
  const mcc = await BinanceUserSettings.findOne({
    where: { userId },
  });

  return mcc;
};

export const addSettings = async ({
  apiKey,
  secretKey,
  userId,
}: {
  apiKey?: string;
  secretKey?: string;
  userId: number;
}) => {
  const settingsData: Record<string, string> = {};

  if (apiKey) settingsData.apiKey = apiKey;
  if (secretKey) settingsData.secretKey = secretKey;

  let userSettings = await BinanceUserSettings.findOne({ where: { userId } });

  if (userSettings) {
    const [, result] = await BinanceUserSettings.update(settingsData, {
      where: { userId },
      returning: true,
    });

    if (result) {
      userSettings = result as unknown as UnwrapArray<typeof result>;
    }
  } else {
    userSettings = await BinanceUserSettings.create({
      ...settingsData,
      userId,
    });
  }

  return userSettings;
};
