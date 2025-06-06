import * as statsController from '@controllers/stats.controller';
import { authenticateJwt } from '@middlewares/passport';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.get(
  '/balance-history',
  authenticateJwt,
  validateEndpoint(statsController.getBalanceHistory.schema),
  statsController.getBalanceHistory.handler,
);
router.get(
  '/total-balance',
  authenticateJwt,
  validateEndpoint(statsController.getTotalBalance.schema),
  statsController.getTotalBalance.handler,
);
router.get(
  '/expenses-history',
  authenticateJwt,
  validateEndpoint(statsController.getExpensesHistory.schema),
  statsController.getExpensesHistory.handler,
);
router.get(
  '/expenses-amount-for-period',
  authenticateJwt,
  validateEndpoint(statsController.getExpensesAmountForPeriod.schema),
  statsController.getExpensesAmountForPeriod.handler,
);
router.get(
  '/spendings-by-categories',
  authenticateJwt,
  validateEndpoint(statsController.getSpendingsByCategories.schema),
  statsController.getSpendingsByCategories.handler,
);

export default router;
