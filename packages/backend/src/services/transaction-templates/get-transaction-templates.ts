import type { TransactionTemplateModel } from '@bt/shared/types';
import TransactionTemplates from '@models/transaction-templates.model';

import { loadTemplateTagIds, serializeTemplate } from './helpers';

export const getTransactionTemplates = async ({ userId }: { userId: number }): Promise<TransactionTemplateModel[]> => {
  const templates = await TransactionTemplates.findAll({
    where: { userId },
    // uuidv7 ids are time-ordered, so the tiebreak keeps same-millisecond rows in insert order.
    order: [
      ['createdAt', 'ASC'],
      ['id', 'ASC'],
    ],
  });

  const tagIdsByTemplate = await loadTemplateTagIds({ templateIds: templates.map((tpl) => tpl.id) });

  return templates.map((template) => serializeTemplate({ template, tagIds: tagIdsByTemplate.get(template.id) ?? [] }));
};
