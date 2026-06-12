import { LOAN_TYPE, type LoanEvent, RecordId } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { MoneyColumn, moneyGetCents, moneySetCents } from '@common/types/money-column';
import Accounts from '@models/accounts.model';
import Users from '@models/users.model';
import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { v7 as uuidv7 } from 'uuid';

@Table({
  tableName: 'LoanDetails',
  timestamps: true,
  freezeTableName: true,
})
export default class LoanDetails extends Model {
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
    validate: { isIn: [Object.values(LOAN_TYPE)] },
  })
  loanType!: LOAN_TYPE;

  @Column(MoneyColumn({ storage: 'cents' }))
  get originalPrincipal(): Money {
    return moneyGetCents(this, 'originalPrincipal');
  }
  set originalPrincipal(val: Money | number) {
    moneySetCents(this, 'originalPrincipal', val);
  }

  @Column(MoneyColumn({ storage: 'cents' }))
  get refOriginalPrincipal(): Money {
    return moneyGetCents(this, 'refOriginalPrincipal');
  }
  set refOriginalPrincipal(val: Money | number) {
    moneySetCents(this, 'refOriginalPrincipal', val);
  }

  // Postgres returns DECIMAL columns as strings; parse at the model boundary
  // so every consumer sees a number and no call site needs its own `Number()`.
  @Column({
    type: DataType.DECIMAL(7, 4),
    allowNull: false,
  })
  get interestRate(): number {
    return Number(this.getDataValue('interestRate'));
  }
  set interestRate(val: number | string) {
    this.setDataValue('interestRate', typeof val === 'number' ? val.toFixed(4) : val);
  }

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  termMonths!: number | null;

  @Column({
    type: DataType.DATEONLY,
    allowNull: false,
  })
  startDate!: string;

  @Column(MoneyColumn({ storage: 'cents', allowNull: true }))
  get minPayment(): Money | null {
    return moneyGetCents(this, 'minPayment');
  }
  set minPayment(val: Money | number | null) {
    moneySetCents(this, 'minPayment', val);
  }

  @Column(MoneyColumn({ storage: 'cents', allowNull: true }))
  get refMinPayment(): Money | null {
    return moneyGetCents(this, 'refMinPayment');
  }
  set refMinPayment(val: Money | number | null) {
    moneySetCents(this, 'refMinPayment', val);
  }

  @Column(MoneyColumn({ storage: 'cents', allowNull: true }))
  get plannedPayment(): Money | null {
    return moneyGetCents(this, 'plannedPayment');
  }
  set plannedPayment(val: Money | number | null) {
    moneySetCents(this, 'plannedPayment', val);
  }

  @Column(MoneyColumn({ storage: 'cents', allowNull: true }))
  get refPlannedPayment(): Money | null {
    return moneyGetCents(this, 'refPlannedPayment');
  }
  set refPlannedPayment(val: Money | number | null) {
    moneySetCents(this, 'refPlannedPayment', val);
  }

  @Column({
    type: DataType.SMALLINT,
    allowNull: true,
  })
  paymentDayOfMonth!: number | null;

  @Column({
    type: DataType.STRING(200),
    allowNull: true,
  })
  lenderName!: string | null;

  @Column({
    type: DataType.STRING(100),
    allowNull: true,
  })
  accountNumber!: string | null;

  // References the replacement loan's Accounts row. The FK constraint lives in
  // the migration only — a second `@ForeignKey(() => Accounts)` here would
  // confuse Sequelize's association inference for the `account` BelongsTo.
  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  replacedByLoanId!: RecordId | null;

  @Column({
    type: DataType.JSONB,
    allowNull: false,
    defaultValue: [],
  })
  events!: LoanEvent[];

  declare createdAt: Date;
  declare updatedAt: Date;

  @BelongsTo(() => Accounts, { foreignKey: 'accountId' })
  account!: Accounts;

  @BelongsTo(() => Users)
  user!: Users;
}
