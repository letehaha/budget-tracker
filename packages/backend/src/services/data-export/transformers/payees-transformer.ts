import Categories from '@models/categories.model';
import PayeeAliases from '@models/payee-aliases.model';
import Payees from '@models/payees.model';
import Tags from '@models/tags.model';

import type { PayeeRow } from '../types';
import { resolveRelationName } from './utils';

export async function transformPayees({ userId }: { userId: number }): Promise<PayeeRow[]> {
  const payees = await Payees.findAll({
    where: { userId },
    order: [['name', 'ASC']],
    include: [
      { model: PayeeAliases, as: 'aliases' },
      { model: Tags, as: 'defaultTags', through: { attributes: [] }, where: { userId }, required: false },
    ],
  });
  if (payees.length === 0) return [];

  // Guard the category lookup with `userId` so a stray cross-user reference
  // cannot leak another user's category name into this export.
  const categories = await Categories.findAll({ where: { userId }, attributes: ['id', 'name'] });
  const categoryNameById = new Map(categories.map((c) => [String(c.id), c.name]));

  return payees.map(
    (payee): PayeeRow => ({
      name: payee.name,
      defaultCategory: resolveRelationName({
        id: payee.defaultCategoryId,
        nameById: categoryNameById,
        relation: 'category',
        context: `payee ${payee.id}`,
      }),
      aliases: (payee.aliases ?? []).map((alias) => alias.rawName),
      defaultTags: (payee.defaultTags ?? []).map((tag) => tag.name),
    }),
  );
}
