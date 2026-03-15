import { ACCOUNT_CATEGORIES, ACCOUNT_TYPES, type AccountExternalData } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { moneyGetCents, moneySetCents } from '@common/types/money-column';
import Balances from '@models/balances.model';
import BankDataProviderConnections from '@models/bank-data-provider-connections.model';
import Currencies from '@models/currencies.model';
import Transactions from '@models/transactions.model';
import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
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

interface AccountsAttributes {
  id: number;
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
  get initialBalance(): Money {
    return moneyGetCents(this, 'initialBalance');
  }
  set initialBalance(val: Money | number) {
    moneySetCents(this, 'initialBalance', val);
  }

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Default(0)
  get refInitialBalance(): Money {
    return moneyGetCents(this, 'refInitialBalance');
  }
  set refInitialBalance(val: Money | number) {
    moneySetCents(this, 'refInitialBalance', val);
  }

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Default(0)
  get currentBalance(): Money {
    return moneyGetCents(this, 'currentBalance');
  }
  set currentBalance(val: Money | number) {
    moneySetCents(this, 'currentBalance', val);
  }

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Default(0)
  get refCurrentBalance(): Money {
    return moneyGetCents(this, 'refCurrentBalance');
  }
  set refCurrentBalance(val: Money | number) {
    moneySetCents(this, 'refCurrentBalance', val);
  }

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Default(0)
  get creditLimit(): Money {
    return moneyGetCents(this, 'creditLimit');
  }
  set creditLimit(val: Money | number) {
    moneySetCents(this, 'creditLimit', val);
  }

  @Attribute(DataTypes.INTEGER)
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
