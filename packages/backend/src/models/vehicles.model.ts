import { DEPRECIATION_PRESET, RecordId, VEHICLE_CLASS } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { MoneyField } from '@common/types/money-column';
import Accounts from '@models/accounts.model';
import Users from '@models/users.model';
import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { v7 as uuidv7 } from 'uuid';

@Table({
  tableName: 'Vehicles',
  timestamps: true,
  freezeTableName: true,
})
export default class Vehicles extends Model {
  @Column({
    type: DataType.UUID,
    primaryKey: true,
    defaultValue: () => uuidv7(),
  })
  declare id: RecordId;

  @ForeignKey(() => Accounts)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    unique: true,
  })
  accountId!: RecordId;

  @ForeignKey(() => Users)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  userId!: number;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  make!: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  model!: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: true,
  })
  trim!: string | null;

  @Column({
    type: DataType.SMALLINT,
    allowNull: false,
  })
  year!: number;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: VEHICLE_CLASS.sedan,
  })
  vehicleClass!: VEHICLE_CLASS;

  @MoneyField({ storage: 'cents' })
  declare purchasePrice: Money;

  @Column({
    type: DataType.DATEONLY,
    allowNull: false,
  })
  purchaseDate!: string;

  @MoneyField({ storage: 'cents', allowNull: true })
  declare valueAnchor: Money | null;

  @Column({
    type: DataType.DATEONLY,
    allowNull: true,
  })
  valueAnchorDate!: string | null;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: DEPRECIATION_PRESET.classDefault,
  })
  depreciationPreset!: DEPRECIATION_PRESET;

  @Column({
    type: DataType.DECIMAL(5, 2),
    allowNull: true,
  })
  customAnnualRatePct!: string | null;

  @Column({
    type: DataType.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 10,
  })
  salvageFloorPct!: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  currentMileage!: number | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  valueLastComputedAt!: Date | null;

  declare createdAt: Date;
  declare updatedAt: Date;

  @BelongsTo(() => Accounts)
  account!: Accounts;

  @BelongsTo(() => Users)
  user!: Users;
}
