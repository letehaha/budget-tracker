import VentureDeals from '@models/venture/venture-deals.model';
import { withTransaction } from '@services/common/with-transaction';

interface DeleteVentureDealParams {
  userId: number;
  dealId: string;
  /** Hard-delete; cascades to all events + event-links via FK CASCADE. */
  force?: boolean;
}

const deleteVentureDealImpl = async ({ userId, dealId, force = false }: DeleteVentureDealParams) => {
  const deal = await VentureDeals.findOne({
    where: { id: dealId, userId },
    paranoid: false,
  });

  if (!deal) return { success: true };

  await deal.destroy({ force });
  return { success: true };
};

export const deleteVentureDeal = withTransaction(deleteVentureDealImpl);
