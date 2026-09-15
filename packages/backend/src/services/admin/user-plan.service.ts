import { Plan, isEntitledSubscription } from '@bt/shared/types';
import { ConflictError, NotFoundError } from '@js/errors';
import { logger } from '@js/utils/logger';
import { invalidateAppUserCache } from '@middlewares/better-auth';
import BillingSubscriptions from '@models/billing-subscriptions.model';
import Users from '@models/users.model';
import { resolveEntitlements } from '@services/entitlements/resolve-entitlements.service';

const toSummary = async ({ user }: { user: Users }) => ({
  id: user.id,
  username: user.username,
  authUserId: user.authUserId,
  createdAt: user.createdAt,
  entitlements: await resolveEntitlements({ user }),
});

export const updateUserPlan = async ({
  userId,
  actorId,
  plan,
  trialEndsAt,
}: {
  userId: number;
  actorId: number;
  plan?: Plan | null;
  trialEndsAt?: Date | null;
}) => {
  const user = await Users.findByPk(userId);
  if (!user) throw new NotFoundError({ message: 'User not found.' });

  if (plan) {
    const subscriptions = await BillingSubscriptions.findAll({ where: { userId } });
    const live = subscriptions.some((s) =>
      isEntitledSubscription({ status: s.status, currentPeriodEndsAt: s.currentPeriodEndsAt }),
    );
    if (live) {
      throw new ConflictError({
        message: 'User has an active paid subscription; cancel it before granting a plan.',
      });
    }
  }

  const before = { plan: user.plan, trialEndsAt: user.trialEndsAt };
  await user.update({
    ...(plan !== undefined && { plan }),
    ...(trialEndsAt !== undefined && { trialEndsAt }),
  });
  logger.info('Admin changed a user plan', {
    actorId,
    userId,
    before,
    after: { plan: user.plan, trialEndsAt: user.trialEndsAt },
  });
  if (user.authUserId) await invalidateAppUserCache({ authUserId: user.authUserId });
  return toSummary({ user });
};
