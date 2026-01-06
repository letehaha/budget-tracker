import { BANK_PROVIDER_TYPE } from '@bt/shared/types';
import Accounts from '@models/Accounts.model';
import Users from '@models/Users.model';
import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from '@sequelize/core';
import {
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
import { decryptCredentials, encryptCredentials } from '@services/bank-data-providers/utils/credential-encryption';

/**
 * Interface for BankDataProviderConnections attributes
 */
export interface BankDataProviderConnectionsAttributes {
  id: number;
  userId: number;
  providerType: BANK_PROVIDER_TYPE;
  providerName: string;
  isActive: boolean;
  credentials: string; // Encrypted JSON string in DB
  metadata: object;
  lastSyncAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * BankDataProviderConnections model
 * Stores user connections to external bank data providers (Monobank, Enable Banking, etc.)
 * Allows users to connect multiple instances of the same provider
 */
@Table({
  timestamps: true,
  tableName: 'BankDataProviderConnections',
  freezeTableName: true,
})
export default class BankDataProviderConnections extends Model<
  InferAttributes<BankDataProviderConnections>,
  InferCreationAttributes<BankDataProviderConnections>
> {
  @Attribute(DataTypes.INTEGER)
  @PrimaryKey
  @AutoIncrement
  @Unique
  declare id: CreationOptional<number>;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Index
  declare userId: number;

  // Type of provider: monobank, enable-banking, etc.
  @Attribute(DataTypes.STRING(50))
  @NotNull
  declare providerType: BANK_PROVIDER_TYPE;

  // User-defined friendly name for this connection
  @Attribute(DataTypes.STRING(255))
  @NotNull
  declare providerName: string;

  @Attribute(DataTypes.BOOLEAN)
  @NotNull
  @Default(true)
  declare isActive: CreationOptional<boolean>;

  // Encrypted provider-specific credentials (API keys, tokens, etc.)
  @Attribute(DataTypes.JSONB)
  @NotNull
  declare credentials: string;

  // Provider-specific metadata (webhooks, client IDs, etc.)
  @Attribute(DataTypes.JSONB)
  declare metadata: object | null;

  // Timestamp of last successful sync
  @Attribute(DataTypes.DATE)
  declare lastSyncAt: Date | null;

  @Attribute(DataTypes.DATE)
  @NotNull
  declare createdAt: CreationOptional<Date>;

  @Attribute(DataTypes.DATE)
  @NotNull
  declare updatedAt: CreationOptional<Date>;

  @BelongsTo(() => Users, 'userId')
  declare user?: NonAttribute<Users>;

  @HasMany(() => Accounts, 'bankDataProviderConnectionId')
  declare accounts?: NonAttribute<Accounts[]>;

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Get decrypted credentials
   * @returns Decrypted credentials object
   */
  getDecryptedCredentials(): Record<string, unknown> {
    return decryptCredentials(this.credentials);
  }

  /**
   * Set encrypted credentials
   * @param credentials - Plain credentials object to encrypt and store
   */
  setEncryptedCredentials(credentials: Record<string, unknown>): void {
    this.credentials = encryptCredentials(credentials);
  }

  /**
   * Update last sync timestamp to current time
   */
  async markSynced(): Promise<void> {
    this.lastSyncAt = new Date();
    await this.save();
  }
}
