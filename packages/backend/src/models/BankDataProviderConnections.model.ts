import {
  Table,
  Column,
  Model,
  ForeignKey,
  BelongsTo,
  DataType,
  HasMany,
} from 'sequelize-typescript';
import Users from '@models/Users.model';
import Accounts from '@models/Accounts.model';
import {
  encryptCredentials,
  decryptCredentials,
} from '@services/bank-data-providers/utils/credential-encryption';
import { BANK_PROVIDER_TYPE } from '@bt/shared/types';

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
export default class BankDataProviderConnections extends Model<BankDataProviderConnectionsAttributes> {
  @BelongsTo(() => Users, {
    as: 'user',
    foreignKey: 'userId',
  })
  user!: Users;

  @HasMany(() => Accounts, {
    as: 'accounts',
    foreignKey: 'bankDataProviderConnectionId',
  })
  accounts!: Accounts[];

  @Column({
    unique: true,
    allowNull: false,
    autoIncrement: true,
    primaryKey: true,
    type: DataType.INTEGER,
  })
  declare id: number;

  @ForeignKey(() => Users)
  @Column({
    allowNull: false,
    type: DataType.INTEGER,
  })
  userId!: number;

  @Column({
    allowNull: false,
    type: DataType.STRING(50),
    comment: 'Type of provider: monobank, enable-banking, etc.',
  })
  providerType!: BANK_PROVIDER_TYPE;

  @Column({
    allowNull: false,
    type: DataType.STRING(255),
    comment: 'User-defined friendly name for this connection',
  })
  providerName!: string;

  @Column({
    allowNull: false,
    defaultValue: true,
    type: DataType.BOOLEAN,
  })
  isActive!: boolean;

  @Column({
    allowNull: false,
    type: DataType.JSONB,
    comment: 'Encrypted provider-specific credentials (API keys, tokens, etc.)',
  })
  credentials!: string; // Stored as encrypted string

  @Column({
    allowNull: true,
    type: DataType.JSONB,
    comment: 'Provider-specific metadata (webhooks, client IDs, etc.)',
  })
  metadata!: object;

  @Column({
    allowNull: true,
    type: DataType.DATE,
    comment: 'Timestamp of last successful sync',
  })
  lastSyncAt!: Date | null;

  @Column({
    allowNull: false,
    type: DataType.DATE,
  })
  declare createdAt: Date;

  @Column({
    allowNull: false,
    type: DataType.DATE,
  })
  declare updatedAt: Date;

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
