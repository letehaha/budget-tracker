import { Column, DataType, Model, Table } from 'sequelize-typescript';

/** One row per email that ever signed up; only a failed signup removes it again.
 *  `firstSeenAt` outlives account deletion, so re-signing up cannot restart the trial. */
@Table({ tableName: 'SignupLedger', timestamps: false, freezeTableName: true })
export default class SignupLedger extends Model {
  @Column({ type: DataType.STRING(64), primaryKey: true, allowNull: false })
  emailHash!: string;

  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  firstSeenAt!: Date;
}
