import type { BackupRestoreWarning } from '@bt/shared/types';
import { DEACTIVATION_REASON } from '@bt/shared/types';
import Currencies from '@models/currencies.model';
import MerchantCategoryCodes from '@models/merchant-category-codes.model';
import { encryptCredentials } from '@services/bank-data-providers/utils/credential-encryption';
import type { Transaction } from 'sequelize';

import { BACKUP_TABLES, type BackupTableDef } from '../registry';
import type { ArchiveAnalysis, TableColumnPlan } from './analyze-archive';
import { buildInsertRecord, runBulkInsert } from './bulk-insert';
import type { ParsedArchive } from './load-archive';
import {
  type GuardedFk,
  buildGuardedReferenceMap,
  foreignReferenceDroppedMessage,
  foreignReferenceNulledMessage,
  guardRowReferences,
} from './owned-reference-guard';

type Row = Record<string, unknown>;

/** Progress tick after each table finishes inserting. */
type TableProgressCallback = (params: { tier: number; table: string; insertedRows: number }) => void | Promise<void>;

interface InsertContext {
  targetUserId: number;
  securitiesRemap: Map<string, string>;
  /** Target MCC id keyed by natural code (compared as strings). */
  mccByCode: Map<string, number>;
  /** Currency codes that exist on the target instance. */
  currencyCodes: Set<string>;
  /** Guarded FK columns per backup file name, derived from model metadata. */
  guardedFkMap: Map<string, GuardedFk[]>;
  /** Ids actually inserted this restore, keyed by DB target table name. A guarded
   *  FK is legitimate only when its value is in the target table's set. */
  insertedIds: Map<string, Set<string>>;
  transaction: Transaction;
  warnings: BackupRestoreWarning[];
}

const hasColumn = ({ plan, field }: { plan: TableColumnPlan; field: string }): boolean =>
  plan.columns.some((c) => c.field === field);

/**
 * Delete any restore-target rows that outlived the shared wipe, so the tiered
 * inserts below always land in empty tables and can keep the backup's preserved
 * primary keys. `destroyUserOwnedData` keeps the Users row, so tables whose only
 * owner link is `userId` with an ON DELETE CASCADE to Users (Payees,
 * PayeeIgnoredNames, …) are never reached by that wipe and would collide on their
 * primary keys when re-inserted. Delete every `insert`-mode `userColumn` table
 * for this user in reverse tier order (children before parents); each survivor's
 * `viaParent` children (e.g. PayeeAliases/PayeeTags off Payees) go with it via FK
 * cascade. Most rows are already gone via the wipe + cascades, so these are
 * usually no-ops — the pass exists to guarantee emptiness for the stragglers.
 */
export async function purgeUserOwnedRestoreTables({
  userId,
  transaction,
}: {
  userId: number;
  transaction: Transaction;
}): Promise<void> {
  const targets = BACKUP_TABLES.filter(
    (def) => def.restoreMode === 'insert' && def.scope.strategy === 'userColumn',
  ).sort((a, b) => b.tier - a.tier);

  for (const def of targets) {
    if (def.scope.strategy !== 'userColumn') continue;
    // force:true so paranoid models (Portfolios, VentureDeals, VenturePlatforms)
    // hard-delete instead of leaving soft-deleted rows behind their default scope.
    await def.model.destroy({ where: { [def.scope.column]: userId }, transaction, force: true });
  }
}

/**
 * Rewrite one row's remappable columns and decide whether it survives. Returns
 * the overrides to layer onto the insert record, or `null` to drop the row —
 * `null` means only "MCC code missing on this target". The caller tallies the
 * drops into one aggregated warning rather than one per row.
 */
function buildRowOverrides({
  def,
  plan,
  row,
  ctx,
}: {
  def: BackupTableDef;
  plan: TableColumnPlan;
  row: Row;
  ctx: InsertContext;
}): Row | null {
  const overrides: Row = {};

  // userId / ownerUserId → the logged-in target user (constant substitution).
  if (hasColumn({ plan, field: 'userId' })) overrides.userId = ctx.targetUserId;
  if (hasColumn({ plan, field: 'ownerUserId' })) overrides.ownerUserId = ctx.targetUserId;

  // securityId → resolved catalog id (only Holdings + InvestmentTransactions
  // carry it; kept-if-free ids aren't in the map and stay verbatim).
  if (hasColumn({ plan, field: 'securityId' }) && typeof row.securityId === 'string') {
    const resolved = ctx.securitiesRemap.get(row.securityId);
    if (resolved) overrides.securityId = resolved;
  }

  // mccId → target id via the natural code carried on the row. Codes are stored
  // as Postgres strings, so compare as strings. A code absent on the target
  // means the row can't be linked — drop it (the caller aggregates the warning).
  if (def.enrichMccCode && row.mccId != null) {
    const code = row.mccCode != null ? String(row.mccCode) : null;
    const targetMccId = code != null ? ctx.mccByCode.get(code) : undefined;
    if (targetMccId === undefined) return null;
    overrides.mccId = targetMccId;
  }

  // Bank credentials never travel: re-encrypt an empty stub on THIS instance and
  // mark the connection deactivated so it reads as "reconnect required" and is
  // never sync-eligible until the user reconnects. Merge into existing metadata.
  if (def.stripSecret === 'bankCredentials') {
    overrides.credentials = encryptCredentials({});
    overrides.isActive = false;
    const metadata = (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Row;
    overrides.metadata = { ...metadata, deactivationReason: DEACTIVATION_REASON.RESTORED };
  }

  return overrides;
}

/**
 * Insert one `insert`-mode table. Self-referential tables (Categories.parentId,
 * AccountGroups.parentGroupId) go in two passes: every row inserts with the
 * parent nulled, then a batched UPDATE repoints the parents once all rows exist
 * (their UUIDs are preserved, so the parents are guaranteed present by then).
 *
 * Every foreign-key column that targets a user-owned table is validated against
 * the ids inserted so far this restore: a value that isn't the restorer's own
 * (a hand-edited archive aiming a child row at another user's row) drops the row
 * when the column is required, or is nulled when it's nullable. Surviving ids are
 * recorded so a dropped parent cascades to its children.
 */
async function insertTable({
  def,
  rows,
  plan,
  ctx,
}: {
  def: BackupTableDef;
  rows: Row[];
  plan: TableColumnPlan;
  ctx: InsertContext;
}): Promise<number> {
  if (rows.length === 0) return 0;

  const selfRefColumn = def.selfRefColumn;
  const targetTable = String(def.model.getTableName());
  let ownIds = ctx.insertedIds.get(targetTable);
  if (!ownIds) {
    ownIds = new Set<string>();
    ctx.insertedIds.set(targetTable, ownIds);
  }

  // The self-ref column is validated in the second pass, not here — exclude it.
  const guardedFks = (ctx.guardedFkMap.get(def.fileName) ?? []).filter((fk) => fk.attrName !== selfRefColumn);

  const secondPass: Array<{ id: string; parent: unknown }> = [];
  const records: Row[] = [];

  // Tally dropped rows so each reason becomes one aggregated warning (with a total
  // count) instead of one warning per dropped row.
  let droppedMccCount = 0;
  let droppedCurrencyCount = 0;
  const fkDroppedByColumn = new Map<string, number>();
  const fkNulledByColumn = new Map<string, number>();

  for (const row of rows) {
    const overrides = buildRowOverrides({ def, plan, row, ctx });
    if (overrides === null) {
      droppedMccCount += 1;
      continue;
    }

    // users-currencies: skip a row whose currency isn't seeded on the target.
    if (def.fileName === 'users-currencies' && !ctx.currencyCodes.has(String(row.currencyCode))) {
      droppedCurrencyCount += 1;
      continue;
    }

    const guard = guardRowReferences({ guardedFks, row, insertedIds: ctx.insertedIds });
    if (!guard.keep) {
      const column = guard.droppedColumn!;
      fkDroppedByColumn.set(column, (fkDroppedByColumn.get(column) ?? 0) + 1);
      continue;
    }
    for (const column of guard.nulledColumns) {
      fkNulledByColumn.set(column, (fkNulledByColumn.get(column) ?? 0) + 1);
    }
    Object.assign(overrides, guard.overrides);

    if (selfRefColumn && row[selfRefColumn] != null) {
      secondPass.push({ id: String(row.id), parent: row[selfRefColumn] });
      overrides[selfRefColumn] = null;
    }

    records.push(buildInsertRecord({ row, plan, overrides }));
    if (row.id != null) ownIds.add(String(row.id));
  }

  if (droppedMccCount > 0) {
    ctx.warnings.push({
      code: 'mcc_code_missing',
      table: def.fileName,
      message: `Dropped ${droppedMccCount} user MCC rule(s) whose merchant category code doesn't exist on this instance.`,
      count: droppedMccCount,
    });
  }
  if (droppedCurrencyCount > 0) {
    ctx.warnings.push({
      code: 'currency_missing',
      table: def.fileName,
      message: `Skipped ${droppedCurrencyCount} currency row(s) whose currency isn't available on this instance.`,
      count: droppedCurrencyCount,
    });
  }
  for (const [column, count] of fkDroppedByColumn) {
    ctx.warnings.push({
      code: 'foreign_reference_dropped',
      table: def.fileName,
      message: foreignReferenceDroppedMessage({ table: def.fileName, column, count }),
      count,
    });
  }
  for (const [column, count] of fkNulledByColumn) {
    ctx.warnings.push({
      code: 'foreign_reference_nulled',
      table: def.fileName,
      message: foreignReferenceNulledMessage({ table: def.fileName, column, count }),
      count,
    });
  }

  const inserted = await runBulkInsert({ model: def.model, records, transaction: ctx.transaction });

  if (selfRefColumn && secondPass.length) {
    // Repoint a parent only when it's one of this table's own surviving ids;
    // a parent outside that set (forged, or dropped upstream) stays null.
    const byParent = new Map<string, string[]>();
    let selfRefNulled = 0;
    for (const { id, parent } of secondPass) {
      const key = String(parent);
      if (!ownIds.has(key)) {
        selfRefNulled += 1;
        continue;
      }
      const bucket = byParent.get(key);
      if (bucket) bucket.push(id);
      else byParent.set(key, [id]);
    }
    for (const [parent, ids] of byParent) {
      await def.model.update({ [selfRefColumn]: parent }, { where: { id: ids }, transaction: ctx.transaction });
    }
    if (selfRefNulled > 0) {
      ctx.warnings.push({
        code: 'foreign_reference_nulled',
        table: def.fileName,
        message: foreignReferenceNulledMessage({ table: def.fileName, column: selfRefColumn, count: selfRefNulled }),
        count: selfRefNulled,
      });
    }
  }

  return inserted;
}

/**
 * Insert every `insert`-mode backup table in registry (tier) order inside the
 * caller's transaction, applying the ID remaps. `skip`-mode tables (shares,
 * invitations) are recorded as warnings and not restored. Users (updateUser)
 * and UserSettings (zodSettings) are finalized by the orchestrator, not here.
 */
export async function insertRestoreTables({
  archive,
  analysis,
  targetUserId,
  securitiesRemap,
  transaction,
  onProgress,
}: {
  archive: ParsedArchive;
  analysis: ArchiveAnalysis;
  targetUserId: number;
  securitiesRemap: Map<string, string>;
  transaction: Transaction;
  onProgress?: TableProgressCallback;
}): Promise<{
  insertedByTable: Record<string, number>;
  warnings: BackupRestoreWarning[];
  insertedIds: Map<string, Set<string>>;
}> {
  const warnings: BackupRestoreWarning[] = [];
  const insertedByTable: Record<string, number> = {};
  const insertedIds = new Map<string, Set<string>>();

  const needsMcc = BACKUP_TABLES.some((d) => d.enrichMccCode && (archive.data.get(d.fileName)?.length ?? 0) > 0);
  const needsCurrency = (archive.data.get('users-currencies')?.length ?? 0) > 0;

  const [mccRows, currencyRows] = await Promise.all([
    needsMcc
      ? (MerchantCategoryCodes.findAll({ attributes: ['id', 'code'], raw: true }) as unknown as Promise<
          Array<{ id: number; code: string | number }>
        >)
      : Promise.resolve<Array<{ id: number; code: string | number }>>([]),
    needsCurrency
      ? (Currencies.findAll({ attributes: ['code'], raw: true }) as unknown as Promise<Array<{ code: string }>>)
      : Promise.resolve<Array<{ code: string }>>([]),
  ]);

  const ctx: InsertContext = {
    targetUserId,
    securitiesRemap,
    mccByCode: new Map(mccRows.map((r) => [String(r.code), r.id])),
    currencyCodes: new Set(currencyRows.map((r) => r.code)),
    guardedFkMap: buildGuardedReferenceMap(),
    insertedIds,
    transaction,
    warnings,
  };

  for (const def of BACKUP_TABLES) {
    if (def.restoreMode === 'skip') {
      const count = archive.data.get(def.fileName)?.length ?? 0;
      // Every backup carries this file even when it's empty — only warn when
      // rows were actually dropped, so a normal restore doesn't show a
      // "skipped 0 rows" warning.
      if (count > 0) {
        warnings.push({
          code: 'shares_skipped',
          table: def.fileName,
          message: `Skipped ${count} "${def.fileName}" row(s): shared resources reference counterpart users that don't exist on this instance.`,
          count,
        });
      }
      continue;
    }
    if (def.restoreMode !== 'insert') continue;

    const rows = archive.data.get(def.fileName) ?? [];
    const plan = analysis.plans.get(def.fileName);
    if (!plan || rows.length === 0) continue;

    const inserted = await insertTable({ def, rows, plan, ctx });
    insertedByTable[def.fileName] = inserted;
    await onProgress?.({ tier: def.tier, table: def.fileName, insertedRows: inserted });
  }

  return { insertedByTable, warnings, insertedIds };
}
