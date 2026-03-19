import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import Tags from '@models/tags.model';
import { withTransaction } from '@services/common/with-transaction';

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

  const tag = await findOrThrowNotFound({
    query: Tags.findOne({ where: { id, userId } }),
    message: t({ key: 'tags.tagNotFound' }),
  });

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
