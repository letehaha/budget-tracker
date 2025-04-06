import * as statsController from '@controllers/stats.controller';
import { authenticateJwt } from '@middlewares/passport';
import { Router } from 'express';

const router = Router({});

router.get('/balance-history', authenticateJwt, statsController.getBalanceHistory);
router.get('/total-balance', authenticateJwt, statsController.getTotalBalance);
router.get('/expenses-history', authenticateJwt, statsController.getExpensesHistory);
router.get('/expenses-amount-for-period', authenticateJwt, statsController.getExpensesAmountForPeriod);
router.get('/spendings-by-categories', authenticateJwt, statsController.getSpendingsByCategories);

export default router;
