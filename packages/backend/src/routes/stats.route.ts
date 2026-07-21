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
  '/net-worth-drivers',
  authenticateSession,
  validateEndpoint(statsController.getNetWorthDrivers.schema),
  statsController.getNetWorthDrivers.handler,
);
router.get(
  '/investment-contributions',
  authenticateSession,
  validateEndpoint(statsController.getInvestmentContributions.schema),
  statsController.getInvestmentContributions.handler,
);
router.get(
  '/pivot',
  authenticateSession,
  validateEndpoint(statsController.getPivotReport.schema),
  statsController.getPivotReport.handler,
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
