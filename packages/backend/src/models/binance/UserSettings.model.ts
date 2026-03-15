import { UnwrapArray } from '@common/types';
import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from '@sequelize/core';
import { Attribute, AutoIncrement, Index, NotNull, PrimaryKey, Table, Unique } from '@sequelize/core/decorators-legacy';

import Users from '../Users.model';

@Table({
  timestamps: false,
  tableName: 'BinanceUserSettings',
  freezeTableName: true,
})
export default class BinanceUserSettings extends Model<
  InferAttributes<BinanceUserSettings>,
  InferCreationAttributes<BinanceUserSettings>
> {
  @Attribute(DataTypes.INTEGER)
  @PrimaryKey
  @AutoIncrement
  @Unique
  declare id: CreationOptional<number>;

  @Attribute(DataTypes.STRING)
  @NotNull
  declare apiKey: string;

  @Attribute(DataTypes.STRING)
  @NotNull
  declare secretKey: string;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Index
  declare userId: number;
}

export const getByUserId = async ({ userId }: { userId: number }) => {
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
    } as { apiKey: string; secretKey: string; userId: number });
  }

  return userSettings;
};
