import Tags from '@models/Tags.model';
import { literal } from 'sequelize';

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
