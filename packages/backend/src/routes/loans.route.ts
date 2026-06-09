import getLoanById from '@controllers/loans/get-loan-by-id';
import getLoans from '@controllers/loans/get-loans';
import { authenticateSession } from '@middlewares/better-auth';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.get('/', authenticateSession, validateEndpoint(getLoans.schema), getLoans.handler);
router.get('/:id', authenticateSession, validateEndpoint(getLoanById.schema), getLoanById.handler);

export default router;
