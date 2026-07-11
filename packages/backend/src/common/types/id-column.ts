import { DataType } from 'sequelize-typescript';
import { v7 as uuidv7 } from 'uuid';

/**
 * Column config for UUID primary keys. Uses uuidv7 so generated ids stay
 * time-ordered (index-friendly inserts, stable created-order sorting).
 *
 * Must stay a function returning a fresh object: sequelize-typescript may
 * mutate the config object it receives per model, so sharing a single config
 * instance across models risks cross-model contamination.
 *
 * @example
 * @Column(IdColumn())
 * declare id: RecordId;
 */
export function IdColumn() {
  return {
    type: DataType.UUID,
    primaryKey: true,
    defaultValue: () => uuidv7(),
  };
}
