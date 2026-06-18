import type { TagMappingConfig } from '@bt/shared/types';
import Tags from '@models/tags.model';
import { createTag } from '@services/tags/create-tag';

import { resolveOrCreateByName } from './resolve-or-create-by-name';

interface CreateTagsIfNeededParams {
  userId: number;
  tagMapping: TagMappingConfig;
}

interface CreateTagsIfNeededResult {
  /**
   * Resolved tag id per distinct source tag string. Only contains entries whose
   * mapping yields a usable tag — `skip` mappings are omitted. Many source
   * strings may resolve to the same id (many-to-one is intentional).
   */
  tagNameToId: Map<string, string>;
  /** Number of tags actually inserted. Reused/linked tags don't count. */
  tagsCreated: number;
}

/**
 * Resolve each distinct source tag string in `tagMapping` to a tag id, creating
 * tags where the user chose `create-new`.
 *
 * - `link-existing`: verify the tag id belongs to the user, then map to it.
 * - `create-new`: find-or-create by name, case-insensitively. When the user
 *   already owns a tag with the same name (any casing) the source string links
 *   to that tag instead of inserting a duplicate, and it isn't counted as
 *   created. Only a genuine insert increments `tagsCreated`.
 * - `skip`: dropped before resolution — the source string is absent from the
 *   result map.
 */
export async function createTagsIfNeeded({
  userId,
  tagMapping,
}: CreateTagsIfNeededParams): Promise<CreateTagsIfNeededResult> {
  // `skip` is dropped here rather than inside the shared resolver: it's a
  // tag-only action, so the resolver never sees those source strings and they
  // stay absent from the result map.
  const mapping: Record<string, { action: 'link-existing'; id: string } | { action: 'create-new' }> = {};
  for (const [sourceName, entry] of Object.entries(tagMapping)) {
    if (entry.action === 'skip') {
      continue;
    }
    mapping[sourceName] =
      entry.action === 'link-existing' ? { action: 'link-existing', id: entry.tagId } : { action: 'create-new' };
  }

  const { nameToId, created } = await resolveOrCreateByName({
    userId,
    mapping,
    findOne: (args) => Tags.findOne(args),
    create: ({ userId: ownerId, name, color }) => createTag({ userId: ownerId, name, color }),
    notFoundMessage: (id) => `Tag with ID ${id} not found`,
  });

  return { tagNameToId: nameToId, tagsCreated: created };
}
