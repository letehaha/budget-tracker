import { SECURITY_PROVIDER } from '@bt/shared/types/investments';
import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from '@sequelize/core';
import { Attribute, Default, NotNull, PrimaryKey, Table } from '@sequelize/core/decorators-legacy';

@Table({
  tableName: 'SecurityCurrencyCaches',
  freezeTableName: true,
  timestamps: true,
})
export default class SecurityCurrencyCache extends Model<
  InferAttributes<SecurityCurrencyCache>,
  InferCreationAttributes<SecurityCurrencyCache>
> {
  @Attribute(DataTypes.STRING)
  @PrimaryKey
  @NotNull
  declare symbol: string;

  @Attribute(DataTypes.STRING)
  @NotNull
  declare currencyCode: string;

  @Attribute(DataTypes.ENUM(...Object.values(SECURITY_PROVIDER)))
  @NotNull
  declare providerName: SECURITY_PROVIDER;

  @Attribute(DataTypes.DATE)
  @NotNull
  @Default(DataTypes.NOW)
  declare createdAt: CreationOptional<Date>;

  @Attribute(DataTypes.DATE)
  @NotNull
  @Default(DataTypes.NOW)
  declare updatedAt: CreationOptional<Date>;
}
