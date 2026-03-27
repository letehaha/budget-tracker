import { TAG_RULE_APPROVAL_MODE, TAG_RULE_TYPE } from '@bt/shared/types';
import { Table, Column, Model, ForeignKey, DataType, BelongsTo, BeforeCreate } from 'sequelize-typescript';
import { v7 as uuidv7 } from 'uuid';

import Tags from './tags.model';
import Users from './users.model';

@Table({
  tableName: 'TagAutoMatchRules',
  timestamps: true,
  freezeTableName: true,
})
export default class TagAutoMatchRules extends Model {
  @Column({
    type: DataType.UUID,
    primaryKey: true,
  })
  declare id: string;

  @BeforeCreate
  static generateUUIDv7(instance: TagAutoMatchRules) {
    if (!instance.id) {
      instance.id = uuidv7();
    }
  }

  @ForeignKey(() => Users)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  userId!: number;

  @ForeignKey(() => Tags)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  tagId!: number;

  @Column({
    type: DataType.ENUM(...Object.values(TAG_RULE_TYPE)),
    allowNull: false,
  })
  type!: TAG_RULE_TYPE;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  isEnabled!: boolean;

  @Column({
    type: DataType.ENUM(...Object.values(TAG_RULE_APPROVAL_MODE)),
    allowNull: false,
    defaultValue: TAG_RULE_APPROVAL_MODE.auto,
  })
  approvalMode!: TAG_RULE_APPROVAL_MODE;

  @Column({
    type: DataType.STRING(500),
    allowNull: true,
  })
  codePattern!: string | null;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  aiPrompt!: string | null;

  declare createdAt: Date;
  declare updatedAt: Date;

  @BelongsTo(() => Users)
  user!: Users;

  @BelongsTo(() => Tags)
  tag!: Tags;
}
