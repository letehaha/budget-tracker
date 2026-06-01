import type { RecordId } from '@bt/shared/types';
import { ACCOUNT_CATEGORIES, ACCOUNT_STATUSES, ACCOUNT_TYPES, type AccountExternalData } from '@bt/shared/types';
import type { Money } from '@common/types/money';
import { moneyGetCents, moneySetCents } from '@common/types/money-column';
import Balances from '@models/balances.model';
import BankDataProviderConnections from '@models/bank-data-provider-connections.model';
import Currencies from '@models/currencies.model';
import Transactions from '@models/transactions.model';
import type { CreationOptional, InferAttributes, InferCreationAttributes, NonAttribute } from '@sequelize/core';
import { DataTypes, Model } from '@sequelize/core';
import {
  AfterCreate,
  Attribute,
  BelongsTo,
  Default,
  HasMany,
  Index,
  NotNull,
  PrimaryKey,
  Table,
} from '@sequelize/core/decorators-legacy';
import { v7 as uuidv7 } from 'uuid';

interface AccountsAttributes {
  id: string;
  name: string;
  initialBalance: Money;
  refInitialBalance: Money;
  currentBalance: Money;
  refCurrentBalance: Money;
  creditLimit: Money;
  refCreditLimit: Money;
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
  status: ACCOUNT_STATUSES;
  excludeFromStats: boolean;
  bankDataProviderConnectionId?: string; // FK to BankDataProviderConnections
}

@Table({
  timestamps: false,
  tableName: 'Accounts',
  freezeTableName: true,
})
export default class Accounts extends Model<InferAttributes<Accounts>, InferCreationAttributes<Accounts>> {
  @Attribute(DataTypes.UUID)
  @PrimaryKey
  @Default(() => uuidv7())
  declare id: CreationOptional<RecordId>;

  @Attribute(DataTypes.STRING)
  @NotNull
  declare name: string;

  @Attribute(DataTypes.BIGINT)
  @NotNull
  @Default(0)
  get initialBalance(): Money {
    return moneyGetCents(this, 'initialBalance');
  }
  set initialBalance(val: Money | number) {
    moneySetCents(this, 'initialBalance', val);
  }

  @Attribute(DataTypes.BIGINT)
  @NotNull
  @Default(0)
  get refInitialBalance(): Money {
    return moneyGetCents(this, 'refInitialBalance');
  }
  set refInitialBalance(val: Money | number) {
    moneySetCents(this, 'refInitialBalance', val);
  }

  @Attribute(DataTypes.BIGINT)
  @NotNull
  @Default(0)
  get currentBalance(): Money {
    return moneyGetCents(this, 'currentBalance');
  }
  set currentBalance(val: Money | number) {
    moneySetCents(this, 'currentBalance', val);
  }

  @Attribute(DataTypes.BIGINT)
  @NotNull
  @Default(0)
  get refCurrentBalance(): Money {
    return moneyGetCents(this, 'refCurrentBalance');
  }
  set refCurrentBalance(val: Money | number) {
    moneySetCents(this, 'refCurrentBalance', val);
  }

  @Attribute(DataTypes.BIGINT)
  @NotNull
  @Default(0)
  get creditLimit(): Money {
    return moneyGetCents(this, 'creditLimit');
  }
  set creditLimit(val: Money | number) {
    moneySetCents(this, 'creditLimit', val);
  }

  @Attribute(DataTypes.BIGINT)
  @NotNull
  @Default(0)
  get refCreditLimit(): Money {
    return moneyGetCents(this, 'refCreditLimit');
  }
  set refCreditLimit(val: Money | number) {
    moneySetCents(this, 'refCreditLimit', val);
  }

  @Attribute(DataTypes.STRING)
  @NotNull
  @Default(ACCOUNT_TYPES.system)
  declare type: CreationOptional<ACCOUNT_TYPES>;

  // VARCHAR(50) + isIn validation (not a DB ENUM) per the project's no-DB-enums
  // rule. The create-vehicles migration converts the legacy enum column to VARCHAR
  // so new categories (e.g. 'vehicle') can be added without altering a PG type.
  @Attribute({
    type: DataTypes.STRING(50),
    validate: { isIn: [Object.values(ACCOUNT_CATEGORIES)] },
  })
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

  @Attribute(DataTypes.ENUM({ values: Object.values(ACCOUNT_STATUSES) }))
  @NotNull
  @Default(ACCOUNT_STATUSES.active)
  declare status: CreationOptional<ACCOUNT_STATUSES>;

  @Attribute(DataTypes.BOOLEAN)
  @NotNull
  @Default(false)
  declare excludeFromStats: CreationOptional<boolean>;

  @Attribute(DataTypes.UUID)
  @Index
  declare bankDataProviderConnectionId: RecordId | null;

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

export interface CreateAccountPayload {
  externalId?: AccountsAttributes['externalId'];
  externalData?: AccountsAttributes['externalData'];
  status?: AccountsAttributes['status'];
  excludeFromStats?: AccountsAttributes['excludeFromStats'];
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
  status = ACCOUNT_STATUSES.active,
  excludeFromStats = false,
  ...rest
}: CreateAccountPayload) => {
  const response = await Accounts.create({
    userId,
    type,
    status,
    excludeFromStats,
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
  status?: AccountsAttributes['status'];
  excludeFromStats?: AccountsAttributes['excludeFromStats'];
  externalData?: AccountsAttributes['externalData'];
}

export async function updateAccountById({ id, userId, ...payload }: UpdateAccountByIdPayload) {
  const where = { id, userId };

  await Accounts.update(payload, { where });

  const account = await getAccountById(where);

  return account;
}

export const deleteAccountById = ({ id, userId }: { id: string; userId: number }) => {
  return Accounts.destroy({ where: { id, userId } });
};

export const getAccountCurrency = async ({ userId, id }: { userId: number; id: string }) => {
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
