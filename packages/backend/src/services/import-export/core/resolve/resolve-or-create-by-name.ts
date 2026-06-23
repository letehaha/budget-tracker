import { pickRandomColor } from '@common/lib/random-color';
import { ValidationError } from '@js/errors';
import { Op, col, fn, where as sequelizeWhere } from 'sequelize';

/**
 * One resolved mapping entry the caller hands to {@link resolveOrCreateByName}.
 * Either link an already-owned record by id, or find-or-create one by name.
 * `skip` is intentionally NOT modelled here — callers that support skipping
 * (tags) must drop those source strings before calling, so the shared resolver
 * only ever sees actionable entries.
 */
type ResolveMapping = { action: 'link-existing'; id: string } | { action: 'create-new' };

interface ResolveOrCreateByNameParams {
  userId: number;
  /**
   * Source string → action. The source string is the key emitted back in
   * `nameToId`; many source strings may resolve to the same id.
   */
  mapping: Record<string, ResolveMapping>;
  /**
   * Case-insensitive find-by-id-and-owner used for both the `link-existing`
   * ownership check and the `create-new` reuse lookup. Resolves to the matched
   * record (only its `id` is read) or `null` when nothing matches.
   */
  findOne: (args: { where: Record<string | symbol, unknown> }) => Promise<{ id: string } | null>;
  /**
   * Insert a fresh record for the source name with the given random colour and
   * return its id. Each resolver supplies its own model-specific create (e.g.
   * the tags service vs. `Categories.create`).
   */
  create: (args: { userId: number; name: string; color: string }) => Promise<{ id: string }>;
  /** Builds the `<thing> with ID <id> not found` message for a failed ownership check. */
  notFoundMessage: (id: string) => string;
}

interface ResolveOrCreateByNameResult {
  /** Resolved id per distinct source string. Many-to-one is intentional. */
  nameToId: Map<string, string>;
  /** Number of records actually inserted. Reused/linked records don't count. */
  created: number;
}

/**
 * Shared find-or-create + ownership-verify used by the CSV import's category and
 * tag resolvers. For each source string:
 *
 * - `link-existing`: verify the id belongs to the user via `findOne`, then map
 *   to it. Throws a `ValidationError` (via `notFoundMessage`) when it doesn't.
 * - `create-new`: find-or-create by name, case-insensitively. When the user
 *   already owns a record with the same name (any casing) the source string
 *   links to that record instead of inserting a duplicate, and it isn't counted
 *   as created. Only a genuine insert increments `created`.
 */
export async function resolveOrCreateByName({
  userId,
  mapping,
  findOne,
  create,
  notFoundMessage,
}: ResolveOrCreateByNameParams): Promise<ResolveOrCreateByNameResult> {
  const nameToId = new Map<string, string>();
  let created = 0;

  for (const [sourceName, entry] of Object.entries(mapping)) {
    if (entry.action === 'link-existing') {
      const existing = await findOne({ where: { id: entry.id, userId } });
      if (!existing) {
        throw new ValidationError({ message: notFoundMessage(entry.id) });
      }
      nameToId.set(sourceName, existing.id);
      continue;
    }

    // create-new: reuse a same-named record (case-insensitive) before
    // inserting. Compare lower(name) to the lowercased source so an EXACT
    // case-insensitive match is required. Op.iLike is unusable here: `%`/`_` in
    // the CSV-supplied sourceName would act as ILIKE wildcards, letting `50%`
    // match `50% off`.
    const reused = await findOne({
      where: { userId, [Op.and]: [sequelizeWhere(fn('lower', col('name')), sourceName.toLowerCase())] },
    });
    if (reused) {
      nameToId.set(sourceName, reused.id);
      continue;
    }

    const inserted = await create({ userId, name: sourceName, color: pickRandomColor() });
    nameToId.set(sourceName, inserted.id);
    created += 1;
  }

  return { nameToId, created };
}
