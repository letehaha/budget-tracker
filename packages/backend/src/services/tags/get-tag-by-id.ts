import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import Tags from '@models/Tags.model';

interface GetTagByIdPayload {
  id: number;
  userId: number;
}

export const getTagById = async ({ id, userId }: GetTagByIdPayload) => {
  const tag = await findOrThrowNotFound({
    query: Tags.findOne({ where: { id, userId } }),
    message: t({ key: 'tags.tagNotFound' }),
  });

  return tag;
};
