import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import Tags from '@models/Tags.model';
import { withTransaction } from '@services/common/with-transaction';

interface DeleteTagPayload {
  id: number;
  userId: number;
}

export const deleteTag = withTransaction(async ({ id, userId }: DeleteTagPayload) => {
  const tag = await findOrThrowNotFound({
    query: Tags.findOne({ where: { id, userId } }),
    message: t({ key: 'tags.tagNotFound' }),
  });

  await tag.destroy();

  return { success: true };
});
