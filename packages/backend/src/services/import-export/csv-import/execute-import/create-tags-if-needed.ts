import type { TagMappingConfig } from '@bt/shared/types';
import { ValidationError } from '@js/errors';
import Tags from '@models/tags.model';
import { createTag } from '@services/tags/create-tag';
import { Op, col, fn, where as sequelizeWhere } from 'sequelize';

import { pickRandomColor } from './pick-random-color';

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
 * - `skip`: dropped — the source string is absent from the result map.
 */
export async function createTagsIfNeeded({
  userId,
  tagMapping,
}: CreateTagsIfNeededParams): Promise<CreateTagsIfNeededResult> {
  const tagNameToId = new Map<string, string>();
  let tagsCreated = 0;

  for (const [sourceName, mapping] of Object.entries(tagMapping)) {
    if (mapping.action === 'skip') {
      continue;
    }

    if (mapping.action === 'link-existing') {
      const tag = await Tags.findOne({ where: { id: mapping.tagId, userId } });
      if (!tag) {
        throw new ValidationError({
          message: `Tag with ID ${mapping.tagId} not found`,
        });
      }
      tagNameToId.set(sourceName, tag.id);
      continue;
    }

    // create-new: reuse a same-named tag (case-insensitive) before inserting.
    // Compare lower(name) to the lowercased source so an EXACT case-insensitive
    // match is required. Op.iLike is unusable here: `%`/`_` in the CSV-supplied
    // sourceName would act as ILIKE wildcards, letting `50%` match `50% off`.
    const existing = await Tags.findOne({
      where: { userId, [Op.and]: [sequelizeWhere(fn('lower', col('name')), sourceName.toLowerCase())] },
    });
    if (existing) {
      tagNameToId.set(sourceName, existing.id);
      continue;
    }

    const created = await createTag({
      userId,
      name: sourceName,
      color: pickRandomColor(),
    });
    tagNameToId.set(sourceName, created.id);
    tagsCreated += 1;
  }

  return { tagNameToId, tagsCreated };
}
