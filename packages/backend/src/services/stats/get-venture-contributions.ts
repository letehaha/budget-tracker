import { type Cents, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES, asCents } from '@bt/shared/types';
import Transactions from '@models/transactions.model';
import VentureDeals from '@models/venture/venture-deals.model';
import VentureEventLinks from '@models/venture/venture-event-links.model';
import VentureEvents from '@models/venture/venture-events.model';
import { endOfDay } from 'date-fns';
import { Op } from 'sequelize';

export interface VentureContributionCents {
  dealId: string;
  name: string;
  amount: Cents;
}

export const getVentureContributions = async ({
  userId,
  from,
  to,
}: {
  userId: number;
  from: string;
  to: string;
}): Promise<VentureContributionCents[]> => {
  const links = await VentureEventLinks.findAll({
    attributes: ['id'],
    include: [
      {
        model: Transactions,
        attributes: ['refAmount', 'transactionType'],
        required: true,
        where: {
          userId,
          transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_venture,
          time: { [Op.between]: [new Date(from), endOfDay(new Date(to))] },
        },
      },
      {
        model: VentureEvents,
        attributes: ['dealId'],
        required: true,
        include: [{ model: VentureDeals, attributes: ['name'], required: true }],
      },
    ],
  });

  const byDeal = new Map<string, VentureContributionCents>();
  for (const link of links) {
    const { dealId, deal } = link.event!;
    const tx = link.transaction!;
    const cents = tx.refAmount.toCents() * (tx.transactionType === TRANSACTION_TYPES.expense ? 1 : -1);
    const entry = byDeal.get(dealId) ?? { dealId, name: deal!.name, amount: asCents(0) };
    entry.amount = asCents(entry.amount + cents);
    byDeal.set(dealId, entry);
  }
  return [...byDeal.values()].filter((d) => d.amount !== 0).toSorted((a, b) => b.amount - a.amount);
};
