import { RecordId } from '@bt/shared/types';
import { Table, Column, Model, DataType } from 'sequelize-typescript';
import { v7 as uuidv7 } from 'uuid';

@Table({
  tableName: 'BrandLogos',
  timestamps: true,
  freezeTableName: true,
})
export default class BrandLogos extends Model {
  @Column({
    type: DataType.UUID,
    primaryKey: true,
    defaultValue: () => uuidv7(),
  })
  declare id: RecordId;

  // Unique: one canonical domain per normalized merchant name. This is the
  // load-bearing invariant the resolver's `findOrCreate` relies on for
  // race-safety — keep it co-located with the migration's
  // `brand_logos_normalized_name_uniq` index.
  @Column({
    type: DataType.STRING(200),
    allowNull: false,
    unique: true,
  })
  normalizedName!: string;

  @Column({
    type: DataType.STRING(253),
    allowNull: false,
  })
  domain!: string;

  @Column({
    type: DataType.STRING(200),
    allowNull: true,
  })
  declare brandName: string | null;

  // VARCHAR + TS-side union (project convention: no DB enums). Identifies
  // which external provider supplied this mapping.
  @Column({
    type: DataType.STRING(16),
    allowNull: false,
    defaultValue: 'logodev',
  })
  source!: string;

  declare createdAt: Date;
  declare updatedAt: Date;
}
