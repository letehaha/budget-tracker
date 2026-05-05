import acceptInvitation from '@controllers/share/accept-invitation';
import createInvitation from '@controllers/share/create-invitation';
import declineInvitation from '@controllers/share/decline-invitation';
import listReceivedInvitations from '@controllers/share/list-received-invitations';
import listSentInvitations from '@controllers/share/list-sent-invitations';
import { authenticateSession } from '@middlewares/better-auth';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.post('/invitations', authenticateSession, validateEndpoint(createInvitation.schema), createInvitation.handler);
router.get(
  '/invitations/sent',
  authenticateSession,
  validateEndpoint(listSentInvitations.schema),
  listSentInvitations.handler,
);
router.get(
  '/invitations/received',
  authenticateSession,
  validateEndpoint(listReceivedInvitations.schema),
  listReceivedInvitations.handler,
);
router.post(
  '/invitations/:token/accept',
  authenticateSession,
  validateEndpoint(acceptInvitation.schema),
  acceptInvitation.handler,
);
router.post(
  '/invitations/:token/decline',
  authenticateSession,
  validateEndpoint(declineInvitation.schema),
  declineInvitation.handler,
);

export default router;
