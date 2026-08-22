import TransactionAutomations from '@models/transaction-automations.model';

export const listAutomations = ({ userId }: { userId: number }) =>
  TransactionAutomations.findAll({
    where: { userId },
    order: [
      ['position', 'ASC'],
      ['id', 'ASC'],
    ],
  });
