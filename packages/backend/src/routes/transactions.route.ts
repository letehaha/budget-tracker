import {
  getTransactionById,
  getTransactionsByTransferId,
  linkTransactions,
} from '@controllers/transactions.controller';
import createTransaction from '@controllers/transactions.controller/create-transaction';
import deleteTransaction from '@controllers/transactions.controller/delete-transaction';
import getTransactions from '@controllers/transactions.controller/get-transaction';
import createRefund from '@controllers/transactions.controller/refunds/create-refund';
import deleteRefund from '@controllers/transactions.controller/refunds/delete-refund';
import getRefund from '@controllers/transactions.controller/refunds/get-refund';
import getRefunds from '@controllers/transactions.controller/refunds/get-refunds';
import getRefundsForTransactionById from '@controllers/transactions.controller/refunds/get-refunds-for-transaction-by-id';
import unlinkTransferTransactions from '@controllers/transactions.controller/transfer-linking/unlink-transfer-transactions';
import updateTransaction from '@controllers/transactions.controller/update-transaction';
import { checkBaseCurrencyLock } from '@middlewares/check-base-currency-lock';
import { authenticateJwt } from '@middlewares/passport';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

// Define all named routes level above to avoid matching with /:id
router.get('/refund', authenticateJwt, validateEndpoint(getRefund.schema), getRefund.handler);
router.get('/refunds', authenticateJwt, validateEndpoint(getRefunds.schema), getRefunds.handler);
router.post('/refund', authenticateJwt, checkBaseCurrencyLock, validateEndpoint(createRefund.schema), createRefund.handler);
router.delete('/refund', authenticateJwt, checkBaseCurrencyLock, validateEndpoint(deleteRefund.schema), deleteRefund.handler);

router.get('/', authenticateJwt, validateEndpoint(getTransactions.schema), getTransactions.handler);
router.get('/:id', authenticateJwt, validateEndpoint(getTransactionById.schema), getTransactionById.handler);
router.get(
  '/:id/refunds',
  authenticateJwt,
  validateEndpoint(getRefundsForTransactionById.schema),
  getRefundsForTransactionById.handler,
);
router.get(
  '/transfer/:transferId',
  authenticateJwt,
  validateEndpoint(getTransactionsByTransferId.schema),
  getTransactionsByTransferId.handler,
);
router.post('/', authenticateJwt, checkBaseCurrencyLock, validateEndpoint(createTransaction.schema), createTransaction.handler);
router.put(
  '/unlink',
  authenticateJwt,
  checkBaseCurrencyLock,
  validateEndpoint(unlinkTransferTransactions.schema),
  unlinkTransferTransactions.handler,
);
router.put('/link', authenticateJwt, checkBaseCurrencyLock, linkTransactions);
router.put('/:id', authenticateJwt, checkBaseCurrencyLock, validateEndpoint(updateTransaction.schema), updateTransaction.handler);
router.delete('/:id', authenticateJwt, checkBaseCurrencyLock, validateEndpoint(deleteTransaction.schema), deleteTransaction.handler);

export default router;
