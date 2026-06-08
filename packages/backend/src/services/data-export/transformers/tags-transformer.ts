import Tags from '@models/tags.model';

import type { TagRow } from '../types';

export async function transformTags({ userId }: { userId: number }): Promise<TagRow[]> {
  const tags = await Tags.findAll({ where: { userId }, order: [['name', 'ASC']] });

  return tags.map(
    (tag): TagRow => ({
      name: tag.name,
      description: tag.description ?? '',
      color: tag.color ?? '',
    }),
  );
}
