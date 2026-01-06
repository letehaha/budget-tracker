import { ACCOUNT_CATEGORIES, ACCOUNT_TYPES, type AccountExternalData } from '@bt/shared/types';
import Balances from '@models/Balances.model';
import BankDataProviderConnections from '@models/BankDataProviderConnections.model';
import Currencies from '@models/Currencies.model';
import Transactions from '@models/Transactions.model';
import Users from '@models/Users.model';
import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
  Op,
} from '@sequelize/core';
import {
  AfterCreate,
  Attribute,
  AutoIncrement,
  BelongsTo,
  Default,
  HasMany,
  Index,
  NotNull,
  PrimaryKey,
  Table,
  Unique,
} from '@sequelize/core/decorators-legacy';

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
export default class Accounts extends Model<InferAttributes<Accounts>, InferCreationAttributes<Accounts>> {
  @Attribute(DataTypes.INTEGER)
  @PrimaryKey
  @AutoIncrement
  @Unique
  declare id: CreationOptional<number>;

  @Attribute(DataTypes.STRING)
  @NotNull
  declare name: string;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Default(0)
  declare initialBalance: CreationOptional<number>;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Default(0)
  declare refInitialBalance: CreationOptional<number>;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Default(0)
  declare currentBalance: CreationOptional<number>;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Default(0)
  declare refCurrentBalance: CreationOptional<number>;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Default(0)
  declare creditLimit: CreationOptional<number>;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Default(0)
  declare refCreditLimit: CreationOptional<number>;

  @Attribute(DataTypes.STRING)
  @NotNull
  @Default(ACCOUNT_TYPES.system)
  declare type: CreationOptional<ACCOUNT_TYPES>;

  @Attribute(DataTypes.ENUM({ values: Object.values(ACCOUNT_CATEGORIES) }))
  @NotNull
  @Default(ACCOUNT_CATEGORIES.general)
  declare accountCategory: CreationOptional<ACCOUNT_CATEGORIES>;

  @Attribute(DataTypes.STRING(3))
  @Index
  declare currencyCode: string;

  @Attribute(DataTypes.INTEGER)
  @Index
  declare userId: number;

  // represents id from the original external system if exists
  @Attribute(DataTypes.STRING)
  declare externalId: string | null;

  @Attribute(DataTypes.JSONB)
  declare externalData: AccountExternalData | null;
  // cashbackType: string;
  // maskedPan: string;
  // type: string;
  // iban: string;

  // represents "if account is active and should be visible in stats"
  @Attribute(DataTypes.BOOLEAN)
  @NotNull
  @Default(true)
  declare isEnabled: CreationOptional<boolean>;

  @Attribute(DataTypes.INTEGER)
  @Index
  declare bankDataProviderConnectionId: number | null;

  @BelongsTo(() => Currencies, 'currencyCode')
  declare currency?: NonAttribute<Currencies>;

  @BelongsTo(() => BankDataProviderConnections, 'bankDataProviderConnectionId')
  declare bankDataProviderConnection?: NonAttribute<BankDataProviderConnections>;

  @HasMany(() => Transactions, 'accountId')
  declare transactions?: NonAttribute<Transactions[]>;

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
  raw,
}: {
  userId: AccountsAttributes['userId'];
  id: AccountsAttributes['id'];
  raw?: boolean;
}) => {
  const account = await Accounts.findOne({
    where: { userId, id },
    raw,
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
