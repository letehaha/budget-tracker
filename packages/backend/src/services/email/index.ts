import { EnvVar, isEnvConfigured } from '@common/utils/env';
import { Resend } from 'resend';

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const resend = isEnvConfigured(EnvVar.RESEND_API_KEY, process.env.RESEND_API_KEY)
  ? new Resend(process.env.RESEND_API_KEY)
  : null;
export const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
export const appName = process.env.AUTH_RP_NAME || 'MoneyMatter';
export const appUrl = process.env.APP_URL || 'https://moneymatter.app';

/**
 * Wraps `innerHtml` (a sequence of `<tr>` rows) in the shared transactional email shell:
 * outer bg table → 560 px card → purple gradient bar → brand name row → inner rows.
 */
export const buildEmailShell = ({ innerHtml }: { innerHtml: string }): string => {
  const safeAppName = escapeHtml(appName);
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <style>
    :root { color-scheme: light; supported-color-schemes: light; }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
          <tr><td style="height: 4px; background: linear-gradient(90deg, #8b5cf6, #a855f7, #9333ea); font-size: 0; line-height: 0;">&nbsp;</td></tr>
          <tr><td style="padding: 32px 40px 0 40px;"><span style="font-size: 20px; font-weight: 700; color: #8b5cf6; letter-spacing: -0.3px;">${safeAppName}</span></td></tr>
          ${innerHtml}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
};
