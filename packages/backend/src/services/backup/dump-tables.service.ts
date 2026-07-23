import type { RecordId } from '@bt/shared/types';
import Holdings from '@models/investments/holdings.model';
import InvestmentTransaction from '@models/investments/investment-transaction.model';
import Securities from '@models/investments/securities.model';
import SecurityPricing from '@models/investments/security-pricing.model';
import MerchantCategoryCodes from '@models/merchant-category-codes.model';
import { Op } from 'sequelize';

import { BACKUP_TABLES, type BackupDumpScope, type BackupTableDef } from './registry';
import { createScopeResolver, type ScopeResolver } from './scope-resolver';

type Row = Record<string, unknown>;

/** One serialized file destined for the zip. */
export interface BackupFile {
  /** Path inside the zip, e.g. `data/categories.json`. */
  path: string;
  /** Row count (1 for the single-object `data/user.json`). */
  rows: number;
  buffer: Buffer;
}

function toBuffer({ value }: { value: unknown }): Buffer {
  return Buffer.from(JSON.stringify(value, null, 2), 'utf8');
}

async function whereForScope({
  scope,
  userId,
  resolver,
}: {
  scope: BackupDumpScope;
  userId: number;
  resolver: ScopeResolver;
}): Promise<Record<string, unknown>> {
  switch (scope.strategy) {
    case 'root':
      return { id: userId };
    case 'userColumn':
      return { [scope.column]: userId };
    case 'viaParent': {
      // Empty id set → `IN (NULL)`, which matches no rows (correct: the user
      // owns no parents, so the child table is empty).
      const parentIds = await resolver.getScope({ scope: scope.parent });
      return { [scope.fk]: { [Op.in]: parentIds } };
    }
  }
}

/** Blank encrypted AI keys — ciphertext is undecryptable on another instance. */
function stripAiApiKeys({ rows }: { rows: Row[] }): void {
  for (const row of rows) {
    const settings = row.settings as { ai?: { apiKeys?: unknown } } | null | undefined;
    if (settings?.ai && Array.isArray(settings.ai.apiKeys)) {
      settings.ai.apiKeys = [];
    }
  }
}

/** Attach each row's MCC natural `code` (stored as a string) for restore remap. */
async function attachMccCodes({ rows }: { rows: Row[] }): Promise<void> {
  const mccIds = [...new Set(rows.map((r) => r.mccId).filter((id): id is number => id != null))];
  if (mccIds.length === 0) return;
  const codes = (await MerchantCategoryCodes.findAll({
    where: { id: { [Op.in]: mccIds } },
    attributes: ['id', 'code'],
    raw: true,
  })) as unknown as { id: number; code: string | number }[];
  const codeById = new Map(codes.map((c) => [c.id, String(c.code)]));
  for (const row of rows) {
    row.mccCode = row.mccId != null ? (codeById.get(row.mccId as number) ?? null) : null;
  }
}

async function dumpTable({
  def,
  userId,
  resolver,
}: {
  def: BackupTableDef;
  userId: number;
  resolver: ScopeResolver;
}): Promise<BackupFile> {
  const where = await whereForScope({ scope: def.scope, userId, resolver });

  if (def.single) {
    // Users: emit the restorable subset as a single object, not an array.
    const row = (await def.model.findOne({
      where,
      attributes: def.fields as string[],
      raw: true,
    })) as unknown as Row | null;
    return { path: `data/${def.fileName}.json`, rows: row ? 1 : 0, buffer: toBuffer({ value: row ?? {} }) };
  }

  // raw:true is the sanctioned exception to the "no raw on Money" rule: a
  // backup must carry exact DB storage values (cents integers, decimal
  // strings, JSONB, arrays) and bypassing the @MoneyField getters is the point.
  const rows = (await def.model.findAll({ where, raw: true, paranoid: false })) as unknown as Row[];

  if (def.stripSecret === 'aiApiKeys') stripAiApiKeys({ rows });
  if (def.stripSecret === 'bankCredentials') {
    for (const row of rows) row.credentials = null;
  }
  if (def.enrichMccCode) await attachMccCodes({ rows });

  return { path: `data/${def.fileName}.json`, rows: rows.length, buffer: toBuffer({ value: rows }) };
}

/**
 * Securities + SecurityPricing referenced by the user's holdings and
 * investment transactions (the only two owner-scoped tables carrying a
 * `securityId`). Not owner-filtered — restore resolves-or-creates them.
 */
async function dumpReferenceFiles({ resolver }: { resolver: ScopeResolver }): Promise<BackupFile[]> {
  const portfolioIds = await resolver.getScope({ scope: 'portfolios' });

  let securityIds: RecordId[] = [];
  if (portfolioIds.length > 0) {
    const [holdings, invTx] = await Promise.all([
      Holdings.findAll({
        where: { portfolioId: { [Op.in]: portfolioIds } },
        attributes: ['securityId'],
        raw: true,
        paranoid: false,
      }),
      InvestmentTransaction.findAll({
        where: { portfolioId: { [Op.in]: portfolioIds } },
        attributes: ['securityId'],
        raw: true,
        paranoid: false,
      }),
    ]);
    const ids = [...holdings, ...invTx]
      .map((r) => (r as unknown as { securityId: RecordId | null }).securityId)
      .filter((id): id is RecordId => id != null);
    securityIds = [...new Set(ids)];
  }

  const [securities, pricing] = securityIds.length
    ? await Promise.all([
        Securities.findAll({ where: { id: { [Op.in]: securityIds } }, raw: true }),
        SecurityPricing.findAll({ where: { securityId: { [Op.in]: securityIds } }, raw: true }),
      ])
    : [[], []];

  return [
    { path: 'reference/securities.json', rows: securities.length, buffer: toBuffer({ value: securities }) },
    { path: 'reference/security-pricing.json', rows: pricing.length, buffer: toBuffer({ value: pricing }) },
  ];
}

/** Dump every backup file (data + reference) for one user. */
export async function dumpBackupFiles({ userId }: { userId: number }): Promise<BackupFile[]> {
  const resolver = createScopeResolver({ userId });

  // Sequential dumps keep peak memory bounded (one materialized table at a
  // time) and let the scope resolver's cache warm before dependents run.
  const dataFiles: BackupFile[] = [];
  for (const def of BACKUP_TABLES) {
    dataFiles.push(await dumpTable({ def, userId, resolver }));
  }

  const referenceFiles = await dumpReferenceFiles({ resolver });
  return [...dataFiles, ...referenceFiles];
}
