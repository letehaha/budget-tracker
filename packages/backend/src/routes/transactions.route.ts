import {
  createTransaction,
  createTransactionSchema,
  deleteTransaction,
  getTransactionById,
  getTransactionsByTransferId,
  linkTransactions,
  unlinkTransferTransactions,
  updateTransaction,
  updateTransactionSchema,
} from '@controllers/transactions.controller';
import { getTransactions, getTransactionsSchema } from '@controllers/transactions.controller/get-transaction';
import { createRefund } from '@controllers/transactions.controller/refunds/create-refund';
import { deleteRefund } from '@controllers/transactions.controller/refunds/delete-refund';
import { getRefund } from '@controllers/transactions.controller/refunds/get-refund';
import { getRefunds, getRefundsSchema } from '@controllers/transactions.controller/refunds/get-refunds';
import { getRefundsForTransactionById } from '@controllers/transactions.controller/refunds/get-refunds-for-transaction-by-id';
import { authenticateJwt } from '@middlewares/passport';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

// Define all named routes level above to avoid matching with /:id
router.get('/refund', authenticateJwt, getRefund);
router.get('/refunds', authenticateJwt, validateEndpoint(getRefundsSchema), getRefunds);
router.post('/refund', authenticateJwt, createRefund);
router.delete('/refund', authenticateJwt, deleteRefund);

router.get('/', authenticateJwt, validateEndpoint(getTransactionsSchema), getTransactions);
router.get('/:id', authenticateJwt, getTransactionById);
router.get('/:id/refunds', authenticateJwt, getRefundsForTransactionById);
router.get('/transfer/:transferId', authenticateJwt, getTransactionsByTransferId);
router.post('/', authenticateJwt, validateEndpoint(createTransactionSchema), createTransaction);
router.put('/unlink', authenticateJwt, unlinkTransferTransactions);
router.put('/link', authenticateJwt, linkTransactions);
router.put('/:id', authenticateJwt, validateEndpoint(updateTransactionSchema), updateTransaction);
router.delete('/:id', authenticateJwt, deleteTransaction);

export default router;
