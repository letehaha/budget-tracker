import appendNoteEvent from '@controllers/loans/append-note-event';
import createLoan from '@controllers/loans/create-loan';
import deleteLoan from '@controllers/loans/delete-loan';
import getLoanById from '@controllers/loans/get-loan-by-id';
import getLoans from '@controllers/loans/get-loans';
import updateLoan from '@controllers/loans/update-loan';
import { authenticateSession } from '@middlewares/better-auth';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.get('/', authenticateSession, validateEndpoint(getLoans.schema), getLoans.handler);
router.get('/:id', authenticateSession, validateEndpoint(getLoanById.schema), getLoanById.handler);
router.post('/', authenticateSession, validateEndpoint(createLoan.schema), createLoan.handler);
router.patch('/:id', authenticateSession, validateEndpoint(updateLoan.schema), updateLoan.handler);
router.delete('/:id', authenticateSession, validateEndpoint(deleteLoan.schema), deleteLoan.handler);
router.post('/:id/events', authenticateSession, validateEndpoint(appendNoteEvent.schema), appendNoteEvent.handler);

export default router;
