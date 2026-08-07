import type { RecordId } from '@bt/shared/types';
import SubscriptionTags from '@models/subscription-tags.model';
import { Op } from 'sequelize';

/**
 * Subscriptions with no tags are absent from the returned map.
 *
 * Don't fold this into the list query as a `Tags` include: that query is a
 * grouped aggregate, and a second many-to-many join multiplies the rows the
 * linked-transactions COUNT is computed over.
 */
export const loadSubscriptionTagIds = async ({
  subscriptionIds,
}: {
  subscriptionIds: string[];
}): Promise<Map<string, RecordId[]>> => {
  const byId = new Map<string, RecordId[]>();
  if (subscriptionIds.length === 0) return byId;

  const rows = await SubscriptionTags.findAll({
    where: { subscriptionId: { [Op.in]: subscriptionIds } },
    attributes: ['subscriptionId', 'tagId'],
  });

  for (const row of rows) {
    const existing = byId.get(row.subscriptionId);
    if (existing) {
      existing.push(row.tagId);
    } else {
      byId.set(row.subscriptionId, [row.tagId]);
    }
  }

  return byId;
};

export const getSubscriptionTagIds = async ({ subscriptionId }: { subscriptionId: string }): Promise<RecordId[]> => {
  const byId = await loadSubscriptionTagIds({ subscriptionIds: [subscriptionId] });
  return byId.get(subscriptionId) ?? [];
};
