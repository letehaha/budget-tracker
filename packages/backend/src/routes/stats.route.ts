import * as statsController from '@controllers/stats.controller';
import { authenticateSession } from '@middlewares/better-auth';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.get(
  '/balance-history',
  authenticateSession,
  validateEndpoint(statsController.getBalanceHistory.schema),
  statsController.getBalanceHistory.handler,
);
router.get(
  '/total-balance',
  authenticateSession,
  validateEndpoint(statsController.getTotalBalance.schema),
  statsController.getTotalBalance.handler,
);
router.get(
  '/expenses-history',
  authenticateSession,
  validateEndpoint(statsController.getExpensesHistory.schema),
  statsController.getExpensesHistory.handler,
);
router.get(
  '/expenses-amount-for-period',
  authenticateSession,
  validateEndpoint(statsController.getExpensesAmountForPeriod.schema),
  statsController.getExpensesAmountForPeriod.handler,
);
router.get(
  '/spendings-by-categories',
  authenticateSession,
  validateEndpoint(statsController.getSpendingsByCategories.schema),
  statsController.getSpendingsByCategories.handler,
);
router.get(
  '/combined-balance-history',
  authenticateSession,
  validateEndpoint(statsController.getCombinedBalanceHistory.schema),
  statsController.getCombinedBalanceHistory.handler,
);
router.get(
  '/cash-flow',
  authenticateSession,
  validateEndpoint(statsController.getCashFlow.schema),
  statsController.getCashFlow.handler,
);
router.get(
  '/cumulative',
  authenticateSession,
  validateEndpoint(statsController.getCumulativeData.schema),
  statsController.getCumulativeData.handler,
);
router.get(
  '/earliest-transaction-date',
  authenticateSession,
  validateEndpoint(statsController.getEarliestTransactionDate.schema),
  statsController.getEarliestTransactionDate.handler,
);

export default router;
