import {
  getTransactionById,
  getTransactionsByTransferId,
  linkTransactions,
} from '@controllers/transactions.controller';
import bulkUpdate from '@controllers/transactions.controller/bulk-update';
import createTransaction from '@controllers/transactions.controller/create-transaction';
import deleteTransaction from '@controllers/transactions.controller/delete-transaction';
import getTransactions from '@controllers/transactions.controller/get-transaction';
import createRefund from '@controllers/transactions.controller/refunds/create-refund';
import deleteRefund from '@controllers/transactions.controller/refunds/delete-refund';
import getRefund from '@controllers/transactions.controller/refunds/get-refund';
import getRefundRecommendations from '@controllers/transactions.controller/refunds/get-refund-recommendations';
import getRefunds from '@controllers/transactions.controller/refunds/get-refunds';
import getRefundsForTransactionById from '@controllers/transactions.controller/refunds/get-refunds-for-transaction-by-id';
import deleteSplit from '@controllers/transactions.controller/splits/delete-split';
import unlinkTransferTransactions from '@controllers/transactions.controller/transfer-linking/unlink-transfer-transactions';
import updateTransaction from '@controllers/transactions.controller/update-transaction';
import { authenticateSession } from '@middlewares/better-auth';
import { checkBaseCurrencyLock } from '@middlewares/check-base-currency-lock';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

// Define all named routes level above to avoid matching with /:id
router.get('/refund', authenticateSession, validateEndpoint(getRefund.schema), getRefund.handler);
router.get('/refunds', authenticateSession, validateEndpoint(getRefunds.schema), getRefunds.handler);
router.get(
  '/refund-recommendations',
  authenticateSession,
  validateEndpoint(getRefundRecommendations.schema),
  getRefundRecommendations.handler,
);
router.post(
  '/refund',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(createRefund.schema),
  createRefund.handler,
);
router.delete(
  '/refund',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(deleteRefund.schema),
  deleteRefund.handler,
);

// Split routes
router.delete(
  '/splits/:splitId',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(deleteSplit.schema),
  deleteSplit.handler,
);

router.get('/', authenticateSession, validateEndpoint(getTransactions.schema), getTransactions.handler);
router.get('/:id', authenticateSession, validateEndpoint(getTransactionById.schema), getTransactionById.handler);
router.get(
  '/:id/refunds',
  authenticateSession,
  validateEndpoint(getRefundsForTransactionById.schema),
  getRefundsForTransactionById.handler,
);
router.get(
  '/transfer/:transferId',
  authenticateSession,
  validateEndpoint(getTransactionsByTransferId.schema),
  getTransactionsByTransferId.handler,
);
router.post(
  '/',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(createTransaction.schema),
  createTransaction.handler,
);
router.put(
  '/unlink',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(unlinkTransferTransactions.schema),
  unlinkTransferTransactions.handler,
);
router.put('/link', authenticateSession, checkBaseCurrencyLock, linkTransactions);
router.put(
  '/bulk',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(bulkUpdate.schema),
  bulkUpdate.handler,
);
router.put(
  '/:id',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(updateTransaction.schema),
  updateTransaction.handler,
);
router.delete(
  '/:id',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(deleteTransaction.schema),
  deleteTransaction.handler,
);

export default router;
