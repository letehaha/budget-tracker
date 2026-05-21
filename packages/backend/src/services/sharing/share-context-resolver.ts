import {
  ACCESS_SOURCES,
  AccessSource,
  ResourceType,
  SHARE_PERMISSIONS,
  SharePermission,
  SharePolicy,
} from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import ResourceShares from '@models/resource-shares.model';
import Users from '@models/users.model';
import type { FindOptions, Includeable, Model, ModelStatic, WhereOptions } from 'sequelize';
import { Op } from 'sequelize';

import { canUserAccessResource } from './auth/can-user-access-resource.service';
import { ShareUserSnapshot, snapshotShareUser } from './share-user-snapshot';

/**
 * Precedence ranks for collision tie-breaking when multiple sources match the same
 * row. Mirrors the resolution chain in `canUserAccessResource` so a recipient sees
 * the same effective permission whether they hit the list or the by-id path.
 *
 * Higher wins. New mechanism (org, team) registers its own rank here so the table
 * stays the single source of truth — never inline a magic number on a `ShareSource`.
 */
export const SHARE_SOURCE_PRIORITY = {
  /** Most specific — explicit per-resource share. */
  perResource: 100,
  /** Less specific — household membership grant. */
  household: 50,
} as const;
export type ShareSourcePriority = (typeof SHARE_SOURCE_PRIORITY)[keyof typeof SHARE_SOURCE_PRIORITY];

/**
 * Public share-context shape attached to every shareable resource the API returns.
 * Mirrors what the serializer turns into the `share` block. Single shape across all
 * resource types — the frontend's per-resource UI is share-shape-agnostic.
 */
export interface ShareContext {
  isOwner: boolean;
  owner: ShareUserSnapshot;
  permission: SharePermission;
  policy: SharePolicy | null;
  accessSource: AccessSource;
}

/** Recipient-side context (owner branch handled by `buildOwnerContext`). */
type RecipientShareContext = ShareContext & { isOwner: false };

/**
 * Output of a `ShareSource.resolve` call. `where` is OR-ed with every other source's
 * `where` to assemble the single bulk-load query; `contextFor` runs per row and
 * returns the recipient context fragment when the row belongs to this source (or
 * `null` when the row was selected by a different source's WHERE).
 */
export interface ResolvedShareSource<TRow> {
  where: WhereOptions;
  contextFor: (row: TRow) => Omit<RecipientShareContext, 'isOwner' | 'owner'> | null;
}

/**
 * One mechanism by which a user gets access to a resource (per-resource share,
 * household membership, future team/org grant, etc.). Each source owns both the
 * grant query and the row-to-grant mapping so divergent mechanisms (e.g. selective
 * household-budget vs all-or-nothing household-account) plug in independently.
 */
export interface ShareSource<TRow> {
  /**
   * Collision tie-breaker — see `SHARE_SOURCE_PRIORITY`. Typing against the named
   * const keeps the precedence table compile-checked instead of a doc-only rule.
   */
  priority: ShareSourcePriority;
  /** Loads grants for this user; returns `null` when this source has no grants. */
  resolve(userId: number): Promise<ResolvedShareSource<TRow> | null>;
}

/**
 * Minimum row shape every shareable model exposes. Today every shareable carries
 * `userId: number` as the owner column; if a future model needs a different name,
 * promote this to a configurable `ownerField` on `ShareableResource` at that point.
 */
export interface ShareableRow {
  id: string;
  userId: number;
}

export interface ShareableResource<TModel extends Model & ShareableRow> {
  model: ModelStatic<TModel>;
  resourceType: ResourceType;
  sources: ShareSource<TModel>[];
}

interface ResolvedSourceEntry<TModel> {
  source: ShareSource<TModel>;
  where: WhereOptions;
  contextFor: ResolvedShareSource<TModel>['contextFor'];
}

/**
 * Bulk-loads every resource the caller can read via at least one share source. The
 * caller may push extra `where` filters (e.g. `status` / `type`) and `include`
 * relations so we don't re-fetch the same rows downstream just to hydrate
 * associations.
 *
 * Returns plain Sequelize instances (not `raw: true`) so column getters (Money,
 * JSONB) stay alive. `_shareContext` is stamped via `Object.assign` to preserve
 * the model prototype.
 */
export const loadSharedFor = async <TModel extends Model & ShareableRow>({
  userId,
  shareable,
  where,
  include,
}: {
  userId: number;
  shareable: ShareableResource<TModel>;
  where?: WhereOptions;
  include?: Includeable[];
}): Promise<Array<TModel & { _shareContext: RecipientShareContext }>> => {
  const resolved: ResolvedSourceEntry<TModel>[] = (
    await Promise.all(
      shareable.sources.map(async (source) => {
        const out = await source.resolve(userId);
        return out ? { source, where: out.where, contextFor: out.contextFor } : null;
      }),
    )
  ).filter((entry): entry is ResolvedSourceEntry<TModel> => entry !== null);

  if (!resolved.length) return [];

  const orClauses = resolved.map((entry) => entry.where);
  const sourcesWhere: WhereOptions = orClauses.length === 1 ? orClauses[0]! : { [Op.or]: orClauses };
  const fullWhere: WhereOptions = where ? { [Op.and]: [sourcesWhere, where] } : sourcesWhere;

  const findOptions: FindOptions = { where: fullWhere };
  if (include) findOptions.include = include;

  const rows = (await shareable.model.findAll(findOptions)) as TModel[];
  if (!rows.length) return [];

  const ownerIds = Array.from(new Set(rows.map((row) => row.userId)));
  const owners = await Users.findAll({ where: { id: { [Op.in]: ownerIds } } });
  const ownersById = new Map(owners.map((owner) => [owner.id, owner]));

  // Sort once outside the row loop so the per-row precedence check is O(sources).
  const sortedByPriority = resolved.toSorted((a, b) => b.source.priority - a.source.priority);

  const result: Array<TModel & { _shareContext: RecipientShareContext }> = [];
  for (const row of rows) {
    let partial: ReturnType<ResolvedShareSource<TModel>['contextFor']> = null;
    for (const entry of sortedByPriority) {
      partial = entry.contextFor(row);
      if (partial) break;
    }
    if (!partial) {
      // Row passed at least one source's WHERE but no source claimed it via
      // `contextFor` — implies the WHERE and matcher of some source drifted out
      // of sync. Drop the row instead of fabricating context: a fabricated grant
      // could leak access; logging surfaces the bug for ops.
      logger.error(
        {
          message: 'Shared resource row has no matching share source context',
          error: new Error(`resourceType=${shareable.resourceType} rowId=${row.id} ownerUserId=${row.userId}`),
        },
        {
          code: 'SHARED_RESOURCE_NO_SOURCE_CONTEXT',
          resourceType: shareable.resourceType,
          userId,
          rowId: row.id,
          ownerUserId: row.userId,
        },
      );
      continue;
    }
    Object.assign(row, {
      _shareContext: {
        isOwner: false,
        owner: snapshotShareUser(ownersById.get(row.userId) ?? null, row.userId),
        ...partial,
      } satisfies RecipientShareContext,
    });
    result.push(row as TModel & { _shareContext: RecipientShareContext });
  }
  return result;
};

/**
 * Single-row variant. Defers permission resolution to `canUserAccessResource` so the
 * canonical precedence chain (owner → per-resource share → household) stays in one
 * place. Returns `null` for owners — the caller handles the owner branch with its own
 * model-specific includes/joins.
 */
export const loadSharedByIdFor = async <TModel extends Model & ShareableRow>({
  userId,
  shareable,
  id,
  include,
}: {
  userId: number;
  shareable: ShareableResource<TModel>;
  id: string;
  include?: Includeable[];
}): Promise<(TModel & { _shareContext: RecipientShareContext }) | null> => {
  const access = await canUserAccessResource({
    userId,
    resourceType: shareable.resourceType,
    resourceId: id,
    requiredPermission: SHARE_PERMISSIONS.read,
  });

  if (!access.granted || access.isOwner) return null;

  const findOptions: FindOptions = { where: { id } };
  if (include) findOptions.include = include;
  const row = (await shareable.model.findOne(findOptions)) as TModel | null;
  if (!row) return null;

  const ownerUser = await Users.findByPk(access.ownerUserId);

  Object.assign(row, {
    _shareContext: {
      isOwner: false,
      owner: snapshotShareUser(ownerUser, access.ownerUserId),
      permission: access.effectivePermission,
      policy: access.policy,
      accessSource: access.accessSource,
    } satisfies RecipientShareContext,
  });
  return row as TModel & { _shareContext: RecipientShareContext };
};

/**
 * Owner-branch context — the caller owns the resource so permission is implicit
 * `manage`. Sources are not consulted on this branch.
 */
export const buildOwnerContext = ({ ownerUser }: { ownerUser: Users }): ShareContext => ({
  isOwner: true,
  owner: snapshotShareUser(ownerUser, ownerUser.id),
  permission: SHARE_PERMISSIONS.manage,
  policy: null,
  accessSource: ACCESS_SOURCES.owner,
});

/**
 * Factory for the standard "explicit `ResourceShares` row of type X selects rows by
 * id" source — the shape every per-resource share follows today. Centralizing it
 * means a future change to how per-resource grants are loaded (e.g. adding a soft-
 * delete filter) lands once, not once per shareable.
 *
 * `accessSource` defaults to `'share'`; pass a different value only if the source
 * is a per-resource grant that should surface under a non-`share` label for the
 * frontend's "manage via X" routing.
 */
export const buildPerResourceSource = <TModel extends Model & ShareableRow>({
  resourceType,
  accessSource = ACCESS_SOURCES.share,
}: {
  resourceType: ResourceType;
  accessSource?: AccessSource;
}): ShareSource<TModel> => ({
  priority: SHARE_SOURCE_PRIORITY.perResource,
  async resolve(userId) {
    const shares = await ResourceShares.findAll({
      where: {
        sharedWithUserId: userId,
        resourceType,
        acceptedAt: { [Op.not]: null },
      },
    });
    if (!shares.length) return null;

    const sharesByResourceId = new Map<string, ResourceShares>();
    const resourceIds: string[] = [];
    for (const share of shares) {
      if (!share.resourceId) continue;
      sharesByResourceId.set(share.resourceId, share);
      resourceIds.push(share.resourceId);
    }
    if (!resourceIds.length) return null;

    return {
      where: { id: { [Op.in]: resourceIds } },
      contextFor: (row) => {
        const share = sharesByResourceId.get(String(row.id));
        if (!share) return null;
        return {
          permission: share.permission,
          policy: share.policy,
          accessSource,
        };
      },
    };
  },
});
