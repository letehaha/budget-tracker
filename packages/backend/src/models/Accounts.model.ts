import {
  Table,
  Column,
  Model,
  ForeignKey,
  BelongsTo,
  DataType,
  AfterCreate,
  HasMany,
} from 'sequelize-typescript';
import { Op } from 'sequelize';
import { ACCOUNT_CATEGORIES, ACCOUNT_TYPES, type AccountExternalData } from '@bt/shared/types';
import Users from '@models/Users.model';
import Currencies from '@models/Currencies.model';
import Balances from '@models/Balances.model';
import Transactions from '@models/Transactions.model';
import BankDataProviderConnections from '@models/BankDataProviderConnections.model';

export interface AccountsAttributes {
  id: number;
  name: string;
  initialBalance: number;
  refInitialBalance: number;
  currentBalance: number;
  refCurrentBalance: number;
  creditLimit: number;
  refCreditLimit: number;
  type: ACCOUNT_TYPES;
  accountCategory: ACCOUNT_CATEGORIES;
  currencyCode: string;
  userId: number;
  externalId: string; // represents id from the original external system if exists
  externalData: AccountExternalData | null; // JSON of any addition fields
  // cashbackType: string; // move to additionalFields that will represent non-unified data
  // maskedPan: string; // move to additionalFields
  // type: string; // move to additionalFields
  // iban: string; // move to additionalFields
  isEnabled: boolean; // represents "if account is active and should be visible in stats"
  bankDataProviderConnectionId?: number; // FK to BankDataProviderConnections
}

@Table({
  timestamps: false,
  tableName: 'Accounts',
  freezeTableName: true,
})
export default class Accounts extends Model {
  @BelongsTo(() => Currencies, {
    as: 'currency',
    foreignKey: 'currencyCode',
  })
  @BelongsTo(() => BankDataProviderConnections, {
    as: 'bankDataProviderConnection',
    foreignKey: 'bankDataProviderConnectionId',
  })
  @HasMany(() => Transactions)
  transactions!: Transactions[];

  @Column({
    unique: true,
    allowNull: false,
    autoIncrement: true,
    primaryKey: true,
    type: DataType.INTEGER,
  })
  declare id: number;

  @Column({ allowNull: false, type: DataType.STRING })
  name!: string;

  @Column({
    allowNull: false,
    defaultValue: 0,
    type: DataType.INTEGER,
  })
  initialBalance!: number;

  @Column({
    allowNull: false,
    defaultValue: 0,
    type: DataType.INTEGER,
  })
  refInitialBalance!: number;

  @Column({
    allowNull: false,
    defaultValue: 0,
    type: DataType.INTEGER,
  })
  currentBalance!: number;

  @Column({
    allowNull: false,
    defaultValue: 0,
    type: DataType.INTEGER,
  })
  refCurrentBalance!: number;

  @Column({
    allowNull: false,
    defaultValue: 0,
    type: DataType.INTEGER,
  })
  creditLimit!: number;

  @Column({
    allowNull: false,
    defaultValue: 0,
    type: DataType.INTEGER,
  })
  refCreditLimit!: number;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    defaultValue: ACCOUNT_TYPES.system,
  })
  type!: ACCOUNT_TYPES;

  @Column({
    allowNull: false,
    defaultValue: ACCOUNT_CATEGORIES.general,
    type: DataType.ENUM({ values: Object.values(ACCOUNT_CATEGORIES) }),
  })
  accountCategory!: ACCOUNT_CATEGORIES;

  @ForeignKey(() => Currencies)
  @Column({ type: DataType.STRING(3) })
  currencyCode!: string;

  @ForeignKey(() => Users)
  @Column({ type: DataType.INTEGER })
  userId!: number;

  // represents id from the original external system if exists
  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  externalId!: string;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  externalData!: AccountExternalData | null; // JSON of any addition fields
  // cashbackType: string;
  // maskedPan: string;
  // type: string;
  // iban: string;

  // represents "if account is active and should be visible in stats"
  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  isEnabled!: boolean;

  @ForeignKey(() => BankDataProviderConnections)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  bankDataProviderConnectionId!: number;

  @AfterCreate
  static async updateAccountBalanceAfterCreate(instance: Accounts) {
    await Balances.handleAccountChange({ account: instance });
  }
}

export interface GetAccountsPayload {
  userId: AccountsAttributes['userId'];
  type?: AccountsAttributes['type'];
}

export const getAccounts = async (payload: GetAccountsPayload) => {
  const { userId, type } = payload;
  const where: {
    userId: AccountsAttributes['userId'];
    type?: AccountsAttributes['type'];
  } = { userId };

  if (type) where.type = type;

  const accounts = await Accounts.findAll({
    where,
    raw: true,
  });

  return accounts;
};

export const getAccountById = async ({
  userId,
  id,
}: {
  userId: AccountsAttributes['userId'];
  id: AccountsAttributes['id'];
}) => {
  const account = await Accounts.findOne({
    where: { userId, id },
  });

  return account;
};

export interface GetAccountsByExternalIdsPayload {
  userId: AccountsAttributes['userId'];
  externalIds: string[];
}
export const getAccountsByExternalIds = async ({ userId, externalIds }: GetAccountsByExternalIdsPayload) => {
  const account = await Accounts.findAll({
    where: {
      userId,
      externalId: {
        [Op.in]: externalIds,
      },
    },
  });

  return account;
};

export interface CreateAccountPayload {
  externalId?: AccountsAttributes['externalId'];
  externalData?: AccountsAttributes['externalData'];
  isEnabled?: AccountsAttributes['isEnabled'];
  accountCategory: AccountsAttributes['accountCategory'];
  currencyCode: AccountsAttributes['currencyCode'];
  name: AccountsAttributes['name'];
  initialBalance: AccountsAttributes['initialBalance'];
  refInitialBalance: AccountsAttributes['refInitialBalance'];
  creditLimit: AccountsAttributes['creditLimit'];
  refCreditLimit: AccountsAttributes['refCreditLimit'];
  userId: AccountsAttributes['userId'];
  type: AccountsAttributes['type'];
}

export const createAccount = async ({
  userId,
  type = ACCOUNT_TYPES.system,
  isEnabled = true,
  ...rest
}: CreateAccountPayload) => {
  const response = await Accounts.create({
    userId,
    type,
    isEnabled,
    currentBalance: rest.initialBalance,
    refCurrentBalance: rest.refInitialBalance,
    ...rest,
  });

  const account = await getAccountById({
    id: response.get('id'),
    userId,
  });

  return account;
};

export interface UpdateAccountByIdPayload {
  id: AccountsAttributes['id'];
  userId: AccountsAttributes['userId'];
  externalId?: AccountsAttributes['externalId'];
  accountCategory?: AccountsAttributes['accountCategory'];
  // currency updating is disabled
  // currencyCode?: AccountsAttributes['currencyCode'];
  name?: AccountsAttributes['name'];
  initialBalance?: AccountsAttributes['initialBalance'];
  refInitialBalance?: AccountsAttributes['refInitialBalance'];
  currentBalance?: AccountsAttributes['currentBalance'];
  refCurrentBalance?: AccountsAttributes['refCurrentBalance'];
  creditLimit?: AccountsAttributes['creditLimit'];
  refCreditLimit?: AccountsAttributes['refCreditLimit'];
  isEnabled?: AccountsAttributes['isEnabled'];
  externalData?: AccountsAttributes['externalData'];
}

export async function updateAccountById({ id, userId, ...payload }: UpdateAccountByIdPayload) {
  const where = { id, userId };

  await Accounts.update(payload, { where });

  const account = await getAccountById(where);

  return account;
}

export const deleteAccountById = ({ id }: { id: number }) => {
  return Accounts.destroy({ where: { id } });
};

export const getAccountCurrency = async ({ userId, id }: { userId: number; id: number }) => {
  const account = (await Accounts.findOne({
    where: { userId, id },
    include: {
      model: Currencies,
    },
  })) as Accounts & { currency: Currencies };

  return account;
};

export const getAccountsByCurrency = ({ userId, currencyCode }: { userId: number; currencyCode: string }) => {
  return Accounts.findAll({ where: { userId, currencyCode } });
};
