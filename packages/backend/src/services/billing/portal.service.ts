import { isEntitledSubscription } from '@bt/shared/types';
import { NotFoundError } from '@js/errors';
import BillingSubscriptions from '@models/billing-subscriptions.model';
import { PLAN_BILLING_URL } from '@root/config';

import { getStripeClient } from './stripe/client';

/**
 * Everything post-purchase — cancel, payment method, invoices, plan switch — happens
 * in Stripe's hosted portal; subscription state comes back through the webhook.
 */
export async function getPortalUrl({
  userId,
  flow,
}: {
  userId: number;
  flow?: 'subscription_update';
}): Promise<{ url: string }> {
  const subscriptions = await BillingSubscriptions.findAll({
    where: { userId },
    attributes: ['externalCustomerId', 'externalSubscriptionId', 'status', 'currentPeriodEndsAt'],
    order: [['createdAt', 'DESC']],
  });
  // The plan-switch flow needs a subscription Stripe will still let the user change.
  const subscription =
    flow === 'subscription_update'
      ? subscriptions.find(({ status, currentPeriodEndsAt }) => isEntitledSubscription({ status, currentPeriodEndsAt }))
      : subscriptions[0];
  if (!subscription) {
    throw new NotFoundError({
      message: 'No billing account yet. Subscribe first to manage billing.',
    });
  }

  const session = await getStripeClient().billingPortal.sessions.create({
    customer: subscription.externalCustomerId,
    return_url: PLAN_BILLING_URL,
    ...(flow === 'subscription_update'
      ? {
          flow_data: {
            type: 'subscription_update' as const,
            subscription_update: { subscription: subscription.externalSubscriptionId },
            after_completion: { type: 'redirect' as const, redirect: { return_url: PLAN_BILLING_URL } },
          },
        }
      : {}),
  });

  return { url: session.url };
}
