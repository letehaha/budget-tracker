import acceptInvitation from '@controllers/share/accept-invitation';
import cancelInvitation from '@controllers/share/cancel-invitation';
import createInvitation from '@controllers/share/create-invitation';
import declineInvitation from '@controllers/share/decline-invitation';
import leaveShare from '@controllers/share/leave-share';
import listMembers from '@controllers/share/list-members';
import listReceivedInvitations from '@controllers/share/list-received-invitations';
import listSentInvitations from '@controllers/share/list-sent-invitations';
import listSharedWithMe from '@controllers/share/list-shared-with-me';
import resendInvitation from '@controllers/share/resend-invitation';
import revokeMember from '@controllers/share/revoke-member';
import updateMember from '@controllers/share/update-member';
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
router.post(
  '/invitations/:id/resend',
  authenticateSession,
  validateEndpoint(resendInvitation.schema),
  resendInvitation.handler,
);
router.delete(
  '/invitations/:id',
  authenticateSession,
  validateEndpoint(cancelInvitation.schema),
  cancelInvitation.handler,
);

router.get(
  '/resources/:resourceType/:resourceId/members',
  authenticateSession,
  validateEndpoint(listMembers.schema),
  listMembers.handler,
);
router.patch(
  '/resources/:resourceType/:resourceId/members/:userId',
  authenticateSession,
  validateEndpoint(updateMember.schema),
  updateMember.handler,
);
router.delete(
  '/resources/:resourceType/:resourceId/members/:userId',
  authenticateSession,
  validateEndpoint(revokeMember.schema),
  revokeMember.handler,
);

router.get('/shared-with-me', authenticateSession, validateEndpoint(listSharedWithMe.schema), listSharedWithMe.handler);
router.post(
  '/shared-with-me/:resourceType/:resourceId/leave',
  authenticateSession,
  validateEndpoint(leaveShare.schema),
  leaveShare.handler,
);

export default router;
