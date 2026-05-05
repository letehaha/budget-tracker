import {
  ResourceType,
  SHARE_PERMISSIONS,
  SharePermission,
  SharePolicy,
  TRANSACTIONS_WRITE_SCOPES,
} from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
const appName = process.env.AUTH_RP_NAME || 'MoneyMatter';
const appUrl = process.env.APP_URL || 'https://moneymatter.app';

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const PERMISSION_LABELS: Record<SharePermission, string> = {
  [SHARE_PERMISSIONS.read]: 'View only',
  [SHARE_PERMISSIONS.write]: 'Can edit',
  [SHARE_PERMISSIONS.manage]: 'Can manage',
};

const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  account: 'account',
};

const policySummary = ({ permission, policy }: { permission: SharePermission; policy: SharePolicy | null }) => {
  if (permission === SHARE_PERMISSIONS.read) return null;
  const scope = policy?.transactionsWriteScope ?? TRANSACTIONS_WRITE_SCOPES.all;
  return scope === TRANSACTIONS_WRITE_SCOPES.own
    ? 'Can edit only transactions they create themselves.'
    : 'Can edit any transaction on the account.';
};

interface SendInvitationEmailParams {
  toEmail: string;
  ownerDisplayName: string;
  resourceType: ResourceType;
  resourceName: string;
  permission: SharePermission;
  policy: SharePolicy | null;
  token: string;
  expiresAt: Date;
}

/**
 * Sends an invitation email via Resend. Inline send (no queue) — failures are logged but
 * don't block the API response, since the in-app notification is the secondary fallback.
 *
 * Returns the Resend message id on success, or `null` if Resend isn't configured (dev/test
 * environments without an API key).
 */
export const sendInvitationEmail = async ({
  toEmail,
  ownerDisplayName,
  resourceType,
  resourceName,
  permission,
  policy,
  token,
  expiresAt,
}: SendInvitationEmailParams): Promise<string | null> => {
  if (!resend) {
    logger.warn('[ShareInvitationEmail] Resend not configured; skipping send');
    return null;
  }

  // Query-param deep-link — dashboard layout watches for `invitation_token` and pops
  // the share-invitation dialog. `/accounts` is a stable landing page; the dialog
  // overlays whatever route the user ended up on.
  const acceptUrl = `${appUrl}/accounts?invitation_token=${encodeURIComponent(token)}`;
  const summaryLine = policySummary({ permission, policy });
  const html = buildEmailHtml({
    ownerDisplayName,
    resourceTypeLabel: RESOURCE_TYPE_LABELS[resourceType],
    resourceName,
    permissionLabel: PERMISSION_LABELS[permission],
    summaryLine,
    acceptUrl,
    expiresAt,
  });

  try {
    const result = await resend.emails.send({
      from: `${appName} <${fromEmail}>`,
      to: toEmail,
      subject: `${ownerDisplayName} invited you to "${resourceName}" on ${appName}`,
      html,
    });
    logger.info(`[ShareInvitationEmail] Sent to ${toEmail}, resendId: ${result.data?.id}`);
    return result.data?.id ?? null;
  } catch (error) {
    logger.error({ message: '[ShareInvitationEmail] Failed to send invitation email', error: error as Error });
    return null;
  }
};

const buildEmailHtml = ({
  ownerDisplayName,
  resourceTypeLabel,
  resourceName,
  permissionLabel,
  summaryLine,
  acceptUrl,
  expiresAt,
}: {
  ownerDisplayName: string;
  resourceTypeLabel: string;
  resourceName: string;
  permissionLabel: string;
  summaryLine: string | null;
  acceptUrl: string;
  expiresAt: Date;
}) => {
  const safeAppName = escapeHtml(appName);
  const safeOwner = escapeHtml(ownerDisplayName);
  const safeResourceType = escapeHtml(resourceTypeLabel);
  const safeResourceName = escapeHtml(resourceName);
  const safePermission = escapeHtml(permissionLabel);
  const safeUrl = escapeHtml(acceptUrl);
  const safeExpires = escapeHtml(expiresAt.toISOString().slice(0, 10));
  const summaryRow = summaryLine
    ? `<tr><td style="padding: 0 0 6px 0; font-size: 14px; color: #6b7280;" colspan="2">${escapeHtml(summaryLine)}</td></tr>`
    : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
          <tr><td style="height: 4px; background: linear-gradient(90deg, #8b5cf6, #a855f7, #9333ea); font-size: 0; line-height: 0;">&nbsp;</td></tr>
          <tr><td style="padding: 32px 40px 0 40px;"><span style="font-size: 20px; font-weight: 700; color: #8b5cf6; letter-spacing: -0.3px;">${safeAppName}</span></td></tr>
          <tr><td style="padding: 28px 40px 0 40px;"><h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #1a1a1a; line-height: 1.3;">${safeOwner} shared a${safeResourceType.match(/^[aeiou]/i) ? 'n' : ''} ${safeResourceType} with you</h1></td></tr>
          <tr><td style="padding: 16px 40px 0 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding: 0 0 6px 0; font-size: 15px; color: #6b7280;">Resource</td><td style="padding: 0 0 6px 0; font-size: 15px; color: #1a1a1a; text-align: right;"><strong>${safeResourceName}</strong></td></tr>
              <tr><td style="padding: 0 0 6px 0; font-size: 15px; color: #6b7280;">Access</td><td style="padding: 0 0 6px 0; font-size: 15px; color: #1a1a1a; text-align: right;"><strong>${safePermission}</strong></td></tr>
              <tr><td style="padding: 0 0 12px 0; font-size: 15px; color: #6b7280;">Expires</td><td style="padding: 0 0 12px 0; font-size: 15px; color: #1a1a1a; text-align: right;"><strong>${safeExpires}</strong></td></tr>
              ${summaryRow}
            </table>
          </td></tr>
          <tr><td style="padding: 24px 40px 0 40px;">
            <a href="${safeUrl}" style="display: inline-block; background-color: #8b5cf6; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">View invitation</a>
          </td></tr>
          <tr><td style="padding: 32px 40px 36px 40px;">
            <p style="margin: 0; font-size: 13px; color: #9ca3af; line-height: 1.5;">If you weren't expecting this invitation, you can safely ignore this email — it expires in 7 days.</p>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
};
