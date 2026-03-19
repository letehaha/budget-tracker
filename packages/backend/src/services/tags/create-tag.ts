import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import Tags from '@models/Tags.model';
import { withTransaction } from '@services/common/with-transaction';

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
