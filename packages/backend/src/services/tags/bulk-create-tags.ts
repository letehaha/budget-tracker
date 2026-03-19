import Tags from '@models/tags.model';
import { withTransaction } from '@services/common/with-transaction';

interface BulkCreateTagsPayload {
  userId: number;
  tags: Array<{
    name: string;
    color: string;
    icon?: string | null;
    description?: string | null;
  }>;
}

export const bulkCreateTags = withTransaction(async ({ userId, tags }: BulkCreateTagsPayload) => {
  const tagsData = tags.map((tag) => ({
    userId,
    name: tag.name,
    color: tag.color,
    icon: tag.icon ?? null,
    description: tag.description ?? null,
  }));

  const createdTags = await Tags.bulkCreate(tagsData);

  return createdTags;
});
