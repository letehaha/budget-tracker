import type { AbstractQueryInterface, Transaction } from '@sequelize/core';
import { randomBytes } from 'crypto';

interface UserRow {
  id: number;
  username: string;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
}

// Migrations are frozen history: inline the slug + name-parse logic instead
// of importing from src/services so this file keeps working even if the
// helpers are later refactored, renamed, or moved. This also matters for the
// production Docker image, which only copies src/migrations and not
// src/services — an external import would crash the entrypoint at startup.
const SLUG_FALLBACK = 'user';
const SLUG_MAX_LENGTH = 64;
const NAME_FIELD_MAX_LENGTH = 100;

function slugifyUsername(input: string | null | undefined): string {
  if (typeof input !== 'string') return SLUG_FALLBACK;

  const slug = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks (U+0300-U+036F)
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!slug) return SLUG_FALLBACK;

  return slug.slice(0, SLUG_MAX_LENGTH).replace(/-+$/g, '') || SLUG_FALLBACK;
}

function capName(value: string): string {
  return value.slice(0, NAME_FIELD_MAX_LENGTH);
}

function parseFullName(input: string | null | undefined): {
  firstName?: string;
  middleName?: string;
  lastName?: string;
} {
  if (typeof input !== 'string') return {};

  const trimmed = input.trim();
  if (!trimmed) return {};

  const parts = trimmed.split(/\s+/).filter(Boolean);

  if (parts.length === 0) return {};
  if (parts.length === 1) return { firstName: capName(parts[0]!) };
  if (parts.length === 2) return { firstName: capName(parts[0]!), lastName: capName(parts[1]!) };

  return {
    firstName: capName(parts[0]!),
    middleName: capName(parts.slice(1, -1).join(' ')),
    lastName: capName(parts[parts.length - 1]!),
  };
}

/**
 * Backfills existing Users.username values to URL-safe identity slugs and
 * populates firstName/middleName/lastName from the original (pre-slug) name.
 *
 * From this migration onward, the signup flow slugifies all new usernames
 * (lowercase, ASCII, hyphenated) and parses `user.name` into the dedicated
 * display-name fields. To keep the column consistent across old and new
 * rows, we apply the same transformation to existing data.
 *
 * Strategy:
 *   1. Compute the desired slug for every user.
 *   2. Resolve collisions deterministically (smallest user id wins the
 *      slug; later collisions get a `-${8 hex}` suffix).
 *   3. Parse the *original* username into firstName/middleName/lastName,
 *      but only fill columns that are currently NULL — never overwrite
 *      values a user has already set.
 *   4. Apply the username rewrites in two phases (rename to a unique temp
 *      value, then to the final slug) so intermediate states never violate
 *      the existing unique constraint on Users.username.
 *
 * Idempotent: rows already at their desired slug are skipped, and name
 * fields are only set when they're NULL.
 */
export default {
  up: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      const [rows] = (await queryInterface.sequelize.query(
        `SELECT id, username, "firstName", "middleName", "lastName" FROM "Users" ORDER BY id ASC`,
        { transaction: t },
      )) as [UserRow[], unknown];

      // Pass 1: compute final assignment for every row, detecting collisions
      // both against earlier rows and against later rows that already hold
      // the desired slug as a no-op.
      const assignments = new Map<number, string>();
      const claimedSlugs = new Set<string>();

      for (const row of rows) {
        const desired = slugifyUsername(row.username);

        let finalSlug = desired;
        let attempts = 0;
        while (claimedSlugs.has(finalSlug)) {
          finalSlug = `${desired}-${randomBytes(4).toString('hex')}`;
          attempts += 1;
          if (attempts > 50) {
            throw new Error(
              `Failed to find a unique slug for user id=${row.id} (base: "${desired}") after 50 attempts`,
            );
          }
        }

        claimedSlugs.add(finalSlug);
        assignments.set(row.id, finalSlug);
      }

      const changes: Array<{ id: number; from: string; to: string }> = [];
      for (const row of rows) {
        const target = assignments.get(row.id)!;
        if (target !== row.username) {
          changes.push({ id: row.id, from: row.username, to: target });
        }
      }

      // Pass 1.5 — backfill firstName/middleName/lastName from the *original*
      // username, but only for columns that are currently NULL. Users who
      // have already set their own name fields are not touched.
      let nameBackfills = 0;
      for (const row of rows) {
        const parsed = parseFullName(row.username);
        const updates: Record<string, string> = {};
        if (row.firstName === null && parsed.firstName) updates.firstName = parsed.firstName;
        if (row.middleName === null && parsed.middleName) updates.middleName = parsed.middleName;
        if (row.lastName === null && parsed.lastName) updates.lastName = parsed.lastName;

        if (Object.keys(updates).length === 0) continue;

        const setClause = Object.keys(updates)
          .map((col) => `"${col}" = :${col}`)
          .join(', ');
        await queryInterface.sequelize.query(`UPDATE "Users" SET ${setClause} WHERE id = :id`, {
          replacements: { ...updates, id: row.id },
          transaction: t,
        });
        nameBackfills += 1;
      }
      console.log(`[slugify-usernames] Backfilled name fields on ${nameBackfills} rows.`);

      if (changes.length === 0) {
        console.log('[slugify-usernames] No usernames need rewriting.');
        await t.commit();
        return;
      }

      console.log(`[slugify-usernames] Rewriting ${changes.length} of ${rows.length} usernames.`);

      // Pass 2 — phase A: stage every changing row at a guaranteed-unique
      // temporary value so the final assignments below cannot collide with
      // rows that haven't been updated yet.
      for (const change of changes) {
        const tempUsername = `__slugify_migrate_${change.id}_${randomBytes(4).toString('hex')}`;
        await queryInterface.sequelize.query(`UPDATE "Users" SET username = :tempUsername WHERE id = :id`, {
          replacements: { tempUsername, id: change.id },
          transaction: t,
        });
      }

      // Pass 2 — phase B: assign the precomputed final slug.
      for (const change of changes) {
        await queryInterface.sequelize.query(`UPDATE "Users" SET username = :finalUsername WHERE id = :id`, {
          replacements: { finalUsername: change.to, id: change.id },
          transaction: t,
        });
        console.log(`[slugify-usernames] id=${change.id}: "${change.from}" → "${change.to}"`);
      }

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  down: async (): Promise<void> => {
    // No-op: the slugify operation is lossy (case, spacing, punctuation
    // are all destroyed) so a deterministic rollback isn't possible.
    // Restoring the original casing/spacing would require a backup taken
    // before the migration ran.
    console.log('[slugify-usernames] down() is a no-op — original usernames cannot be reconstructed from slugs.');
  },
};
