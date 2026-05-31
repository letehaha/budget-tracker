import type { ResourceType } from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import { appName, appUrl, buildEmailShell, escapeHtml, fromEmail, resend } from '@services/email';

// Household revocation has its own email template — this map is only hit for
// per-resource revokes. Keep the household entry for type exhaustiveness; if it
// ever appears in copy, the wording is reasonable.
const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  account: 'account',
  household: 'household',
  budget: 'budget',
};

// Owners managing a resource land on the dashboard surface that lists that
// resource type. Mirrors the deep-link strategy in share-invitation-email.ts.
const RESOURCE_OWNER_MANAGE_PATHS: Record<ResourceType, string> = {
  account: '/accounts',
  budget: '/budgets',
  household: '/settings/household',
};

const RESOURCE_OWNER_MANAGE_CTA: Record<ResourceType, string> = {
  account: 'Manage your accounts',
  budget: 'Manage your budgets',
  household: 'Manage your household',
};

interface SendShareRevokedEmailParams {
  toEmail: string;
  ownerDisplayName: string;
  resourceType: ResourceType;
  resourceName: string;
}

/**
 * Notifies a recipient that their access to a shared resource was revoked. Inline send;
 * failures are logged (with stable `code` for ops dashboards) but do not fail the request
 * — the in-app notification is the durable record.
 */
export const sendShareRevokedEmail = async ({
  toEmail,
  ownerDisplayName,
  resourceType,
  resourceName,
}: SendShareRevokedEmailParams): Promise<string | null> => {
  if (!resend) {
    logger.warn('[ShareRevokedEmail] Resend not configured; skipping send');
    return null;
  }

  const sharedWithMeUrl = `${appUrl}/shared-with-me`;
  const html = buildShareRevokedHtml({
    ownerDisplayName,
    resourceTypeLabel: RESOURCE_TYPE_LABELS[resourceType],
    resourceName,
    sharedWithMeUrl,
  });

  try {
    const result = await resend.emails.send({
      from: `${appName} <${fromEmail}>`,
      to: toEmail,
      subject: `Your access to "${resourceName}" was revoked`,
      html,
    });
    logger.info(`[ShareRevokedEmail] Sent to ${toEmail}, resendId: ${result.data?.id}`);
    return result.data?.id ?? null;
  } catch (error) {
    logger.error(
      { message: '[ShareRevokedEmail] Failed to send revocation email', error: error as Error },
      { code: 'SHARE_REVOKED_EMAIL_FAILED', resourceType, resourceName },
    );
    return null;
  }
};

interface SendShareLeftEmailParams {
  toEmail: string;
  recipientDisplayName: string;
  resourceType: ResourceType;
  resourceName: string;
}

/**
 * Notifies an owner that a recipient voluntarily left their share. Same delivery semantics
 * as `sendShareRevokedEmail` — best-effort, logged on failure.
 */
export const sendShareLeftEmail = async ({
  toEmail,
  recipientDisplayName,
  resourceType,
  resourceName,
}: SendShareLeftEmailParams): Promise<string | null> => {
  if (!resend) {
    logger.warn('[ShareLeftEmail] Resend not configured; skipping send');
    return null;
  }

  const manageUrl = `${appUrl}${RESOURCE_OWNER_MANAGE_PATHS[resourceType]}`;
  const html = buildShareLeftHtml({
    recipientDisplayName,
    resourceTypeLabel: RESOURCE_TYPE_LABELS[resourceType],
    resourceName,
    manageUrl,
    manageCtaLabel: RESOURCE_OWNER_MANAGE_CTA[resourceType],
  });

  try {
    const result = await resend.emails.send({
      from: `${appName} <${fromEmail}>`,
      to: toEmail,
      subject: `${recipientDisplayName} left "${resourceName}"`,
      html,
    });
    logger.info(`[ShareLeftEmail] Sent to ${toEmail}, resendId: ${result.data?.id}`);
    return result.data?.id ?? null;
  } catch (error) {
    logger.error(
      { message: '[ShareLeftEmail] Failed to send share-left email', error: error as Error },
      { code: 'SHARE_LEFT_EMAIL_FAILED', resourceType, resourceName },
    );
    return null;
  }
};

const buildShareRevokedHtml = ({
  ownerDisplayName,
  resourceTypeLabel,
  resourceName,
  sharedWithMeUrl,
}: {
  ownerDisplayName: string;
  resourceTypeLabel: string;
  resourceName: string;
  sharedWithMeUrl: string;
}) => {
  const safeOwner = escapeHtml(ownerDisplayName);
  const safeResourceType = escapeHtml(resourceTypeLabel);
  const safeResourceName = escapeHtml(resourceName);
  const safeUrl = escapeHtml(sharedWithMeUrl);
  const article = safeResourceType.match(/^[aeiou]/i) ? 'an' : 'a';

  return buildEmailShell({
    innerHtml: `
          <tr><td style="padding: 28px 40px 0 40px;"><h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #1a1a1a; line-height: 1.3;">Access revoked</h1></td></tr>
          <tr><td style="padding: 16px 40px 0 40px; font-size: 15px; color: #1a1a1a; line-height: 1.5;">
            <p style="margin: 0 0 12px 0;">${safeOwner} revoked your access to ${article} ${safeResourceType} <strong>${safeResourceName}</strong>.</p>
            <p style="margin: 0; font-size: 13px; color: #6b7280;">It will no longer appear in your shared list. If you think this was a mistake, contact ${safeOwner} directly.</p>
          </td></tr>
          <tr><td style="padding: 24px 40px 0 40px;">
            <a href="${safeUrl}" style="display: inline-block; background-color: #8b5cf6; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">View shared with me</a>
          </td></tr>
          <tr><td style="padding: 32px 40px 36px 40px;">&nbsp;</td></tr>`,
  });
};

const buildShareLeftHtml = ({
  recipientDisplayName,
  resourceTypeLabel,
  resourceName,
  manageUrl,
  manageCtaLabel,
}: {
  recipientDisplayName: string;
  resourceTypeLabel: string;
  resourceName: string;
  manageUrl: string;
  manageCtaLabel: string;
}) => {
  const safeRecipient = escapeHtml(recipientDisplayName);
  const safeResourceType = escapeHtml(resourceTypeLabel);
  const safeResourceName = escapeHtml(resourceName);
  const safeUrl = escapeHtml(manageUrl);
  const safeCta = escapeHtml(manageCtaLabel);
  const article = safeResourceType.match(/^[aeiou]/i) ? 'an' : 'a';

  return buildEmailShell({
    innerHtml: `
          <tr><td style="padding: 28px 40px 0 40px;"><h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #1a1a1a; line-height: 1.3;">A recipient left your share</h1></td></tr>
          <tr><td style="padding: 16px 40px 0 40px; font-size: 15px; color: #1a1a1a; line-height: 1.5;">
            <p style="margin: 0 0 12px 0;"><strong>${safeRecipient}</strong> left ${article} ${safeResourceType} you shared with them: <strong>${safeResourceName}</strong>.</p>
            <p style="margin: 0; font-size: 13px; color: #6b7280;">No action needed — they no longer see the resource. You can invite them again or share with someone else.</p>
          </td></tr>
          <tr><td style="padding: 24px 40px 0 40px;">
            <a href="${safeUrl}" style="display: inline-block; background-color: #8b5cf6; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">${safeCta}</a>
          </td></tr>
          <tr><td style="padding: 32px 40px 36px 40px;">&nbsp;</td></tr>`,
  });
};
