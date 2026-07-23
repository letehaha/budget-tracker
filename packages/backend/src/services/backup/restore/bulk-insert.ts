import { connection } from '@models/connection';
import { Model, type ModelStatic, type QueryOptions, type Transaction } from 'sequelize';

import type { TableColumnPlan } from './analyze-archive';
import { getFieldMappedAttributes } from './model-attributes';

type Row = Record<string, unknown>;
type AnyModel = ModelStatic<Model>;

/**
 * Project one raw dumped row onto the insert plan's columns, keyed by DB column
 * name (what `bulkInsert` writes). Every plan column is set — missing keys land
 * as NULL — so all records in a batch share one column set. `overrides` carries
 * remapped values (userId, mccId, securityId, self-ref parent, credentials).
 */
export function buildInsertRecord({
  row,
  plan,
  overrides,
}: {
  row: Row;
  plan: TableColumnPlan;
  overrides?: Record<string, unknown>;
}): Row {
  const record: Row = {};
  for (const col of plan.columns) {
    record[col.field] = row[col.attrName] ?? null;
  }
  if (overrides) Object.assign(record, overrides);
  return record;
}

/**
 * Insert already-projected records in batches, bypassing the model layer so
 * timestamps and money values land verbatim. Passing the model's field-mapped
 * attributes lets the query generator serialize JSONB / arrays / decimals by
 * their real column types. `ignoreDuplicates` emits `ON CONFLICT DO NOTHING`
 * (used for idempotent SecurityPricing inserts). Returns the number of rows
 * actually inserted (accounts for rows `ignoreDuplicates` skipped as conflicts).
 */
export async function runBulkInsert({
  model,
  records,
  transaction,
  ignoreDuplicates = false,
  batchSize = 1000,
}: {
  model: AnyModel;
  records: Row[];
  transaction?: Transaction;
  ignoreDuplicates?: boolean;
  batchSize?: number;
}): Promise<number> {
  if (records.length === 0) return 0;
  const queryInterface = connection.sequelize.getQueryInterface();
  const fieldAttrs = getFieldMappedAttributes({ model });
  const tableName = model.getTableName();

  // `ignoreDuplicates` (→ ON CONFLICT DO NOTHING) isn't on QueryOptions but the
  // query generator reads it; widen the option bag to pass it through.
  // With `ignoreDuplicates` a batch can silently drop rows on conflict, so ask
  // Postgres to RETURNING them: skipped rows produce no RETURNING row, so
  // counting what comes back gives the real inserted count instead of assuming
  // every row in the batch landed.
  const options = { transaction, ignoreDuplicates, returning: ignoreDuplicates } as QueryOptions & {
    ignoreDuplicates?: boolean;
    returning?: boolean;
  };

  let insertedCount = 0;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const result = await queryInterface.bulkInsert(tableName, batch, options, fieldAttrs);
    insertedCount += ignoreDuplicates ? (result as unknown as Row[]).length : batch.length;
  }
  return insertedCount;
}
