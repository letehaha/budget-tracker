import { createStatusController } from '@controllers/import-export/helpers/create-status-controller';
import { getBudgetBakersWalletImportProgress } from '@services/import-export/budget-bakers-wallet-import';

export const budgetBakersWalletStatusController = createStatusController({
  getProgress: getBudgetBakersWalletImportProgress,
  notFoundMessage: 'Budget Bakers Wallet import job not found.',
});
