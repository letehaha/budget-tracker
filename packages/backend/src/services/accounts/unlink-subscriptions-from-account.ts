import Subscriptions from '@models/subscriptions.model';

/**
 * Detaches every subscription from an account that is going away (archived or
 * deleted). `autoRecord` is cleared in the same write because the
 * `chk_subscriptions_auto_record_requires_booking_inputs` check constraint
 * requires an `accountId` whenever auto-record is on — nulling the account
 * alone makes the row unsaveable.
 */
export const unlinkSubscriptionsFromAccount = async ({ accountId }: { accountId: string }) => {
  await Subscriptions.update({ accountId: null, autoRecord: false }, { where: { accountId } });
};
