import { t } from '@i18n/index';
import { NotFoundError, ValidationError } from '@js/errors';
import Tags from '@models/Tags.model';
import { withTransaction } from '@services/common/with-transaction';
import { literal } from 'sequelize';

interface CreateTagPayload {
  userId: number;
  name: string;
  color: string;
  icon?: string | null;
  description?: string | null;
}

export const createTag = withTransaction(async (payload: CreateTagPayload) => {
  const { userId, name, color, icon, description } = payload;

  // Check for duplicate tag name for this user
  const existingTag = await Tags.findOne({
    where: { userId, name },
  });

  if (existingTag) {
    throw new ValidationError({ message: t({ key: 'tags.tagNameAlreadyExists' }) });
  }

  const tag = await Tags.create({
    userId,
    name,
    color,
    icon: icon ?? null,
    description: description ?? null,
  });

  return tag;
});

interface GetTagsPayload {
  userId: number;
}

export const getTags = async ({ userId }: GetTagsPayload) => {
  const tags = (await Tags.findAll({
    where: { userId },
    order: [['createdAt', 'ASC']],
    attributes: {
      include: [
        [
          literal(`(
            SELECT COUNT(*)
            FROM "TagReminders"
            WHERE "TagReminders"."tagId" = "Tags"."id"
          )`),
          'remindersCount',
        ],
      ],
    },
    raw: true,
  })) as (Tags & { remindersCount: string })[];

  return tags.map((i) => ({
    ...i,
    remindersCount: Number(i.remindersCount),
  }));
};

interface GetTagByIdPayload {
  id: number;
  userId: number;
}

export const getTagById = async ({ id, userId }: GetTagByIdPayload) => {
  const tag = await Tags.findOne({
    where: { id, userId },
  });

  if (!tag) {
    throw new NotFoundError({ message: t({ key: 'tags.tagNotFound' }) });
  }

  return tag;
};

interface UpdateTagPayload {
  id: number;
  userId: number;
  name?: string;
  color?: string;
  icon?: string | null;
  description?: string | null;
}

export const updateTag = withTransaction(async (payload: UpdateTagPayload) => {
  const { id, userId, name, color, icon, description } = payload;

  const tag = await Tags.findOne({
    where: { id, userId },
  });

  if (!tag) {
    throw new NotFoundError({ message: t({ key: 'tags.tagNotFound' }) });
  }

  // Check for duplicate name if name is being updated
  if (name && name !== tag.name) {
    const existingTag = await Tags.findOne({
      where: { userId, name },
    });

    if (existingTag) {
      throw new ValidationError({ message: t({ key: 'tags.tagNameAlreadyExists' }) });
    }
  }

  await tag.update({
    ...(name !== undefined && { name }),
    ...(color !== undefined && { color }),
    ...(icon !== undefined && { icon }),
    ...(description !== undefined && { description }),
  });

  return tag;
});

interface DeleteTagPayload {
  id: number;
  userId: number;
}

export const deleteTag = withTransaction(async ({ id, userId }: DeleteTagPayload) => {
  const tag = await Tags.findOne({
    where: { id, userId },
  });

  if (!tag) {
    throw new NotFoundError({ message: t({ key: 'tags.tagNotFound' }) });
  }

  await tag.destroy();

  return { success: true };
});

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
