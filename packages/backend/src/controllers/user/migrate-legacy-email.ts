import { authPool } from '@config/auth';
import { createController } from '@controllers/helpers/controller-factory';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import { logger } from '@js/utils/logger';
import crypto from 'crypto';
import { Resend } from 'resend';
import { z } from 'zod';

const LEGACY_EMAIL_SUFFIX = '@app.migrated';
const TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

// Initialize Resend for verification emails
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

/**
 * Step 1: Request email change - sends verification email to new address
 */
export const migrateLegacyEmail = createController(
  z.object({
    body: z.object({
      newEmail: z.string().email(),
    }),
  }),
  async ({ user, body }) => {
    const { newEmail } = body;

    // Get the auth user ID from the app user
    if (!user.authUserId) {
      throw new ValidationError({ message: t({ key: 'auth.migration.userNotLinked' }) });
    }

    // Verify this is a legacy user by checking their current email
    const currentUserResult = await authPool.query('SELECT email FROM ba_user WHERE id = $1', [user.authUserId]);

    if (currentUserResult.rows.length === 0) {
      throw new ValidationError({ message: t({ key: 'auth.migration.authUserNotFound' }) });
    }

    const currentEmail = currentUserResult.rows[0].email;

    // Only allow migration for legacy users
    if (!currentEmail.endsWith(LEGACY_EMAIL_SUFFIX)) {
      throw new ValidationError({
        message: t({ key: 'auth.migration.onlyLegacyAccounts' }),
      });
    }

    // Check if the new email is already in use
    const existingUser = await authPool.query('SELECT id FROM ba_user WHERE email = $1 AND id != $2', [
      newEmail.toLowerCase(),
      user.authUserId,
    ]);

    if (existingUser.rows.length > 0) {
      throw new ValidationError({ message: t({ key: 'auth.migration.emailAlreadyInUse' }) });
    }

    // Generate verification token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS);

    // Store verification in ba_verification table
    // Use identifier format: "legacy-email-change:{authUserId}"
    const identifier = `legacy-email-change:${user.authUserId}`;

    // Delete any existing verification for this user
    await authPool.query('DELETE FROM ba_verification WHERE identifier = $1', [identifier]);

    // Insert new verification record with new email stored in value
    await authPool.query(
      'INSERT INTO ba_verification (id, identifier, value, "expiresAt", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, NOW(), NOW())',
      [crypto.randomUUID(), identifier, JSON.stringify({ token, newEmail: newEmail.toLowerCase() }), expiresAt],
    );

    // Send verification email
    if (!resend) {
      logger.warn('Email verification skipped: RESEND_API_KEY not configured');
      throw new ValidationError({ message: t({ key: 'auth.migration.emailServiceNotConfigured' }) });
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
    const appName = process.env.AUTH_RP_NAME || 'MoneyMatter';
    const frontendOrigin = process.env.AUTH_ORIGIN || 'https://localhost:8100';
    const verifyUrl = `${frontendOrigin}/auth/verify-legacy-email?token=${token}`;

    try {
      const result = await resend.emails.send({
        from: `${appName} <${fromEmail}>`,
        to: newEmail.toLowerCase(),
        subject: t({ key: 'emails.legacyEmailMigration.subject', variables: { appName } }),
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>${t({ key: 'emails.legacyEmailMigration.heading' })}</h2>
            <p>${t({ key: 'emails.legacyEmailMigration.body' })}</p>
            <p style="margin: 24px 0;">
              <a href="${verifyUrl}" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                ${t({ key: 'emails.legacyEmailMigration.buttonText' })}
              </a>
            </p>
            <p style="color: #666; font-size: 14px;">
              ${t({ key: 'emails.legacyEmailMigration.orCopyLink' })} <br/>
              <a href="${verifyUrl}" style="color: #0070f3;">${verifyUrl}</a>
            </p>
            <p style="color: #999; font-size: 12px; margin-top: 32px;">
              ${t({ key: 'emails.legacyEmailMigration.expiryNotice' })}
            </p>
          </div>
        `,
      });
      logger.info(`Legacy email migration verification sent to ${newEmail}, resendId: ${result.data?.id}`);
    } catch (error) {
      logger.error({ message: 'Failed to send legacy email migration verification', error: error as Error });
      throw new ValidationError({ message: t({ key: 'auth.migration.failedToSendVerification' }) });
    }

    return { data: { success: true, message: t({ key: 'auth.migration.verificationSent' }) } };
  },
);

/**
 * Step 2: Verify and complete email change
 */
export const verifyLegacyEmailChange = createController(
  z.object({
    body: z.object({
      token: z.string(),
    }),
  }),
  async ({ body }) => {
    const { token } = body;

    // Find verification record by token
    const result = await authPool.query(
      'SELECT identifier, value, "expiresAt" FROM ba_verification WHERE identifier LIKE $1',
      ['legacy-email-change:%'],
    );

    // Find the matching verification by token
    let matchedVerification: { identifier: string; newEmail: string; authUserId: string } | null = null;

    for (const row of result.rows) {
      try {
        const data = JSON.parse(row.value);
        if (data.token === token) {
          // Check expiry
          if (new Date(row.expiresAt) < new Date()) {
            // Clean up expired token
            await authPool.query('DELETE FROM ba_verification WHERE identifier = $1', [row.identifier]);
            throw new ValidationError({ message: t({ key: 'auth.migration.linkExpired' }) });
          }

          matchedVerification = {
            identifier: row.identifier,
            newEmail: data.newEmail,
            authUserId: row.identifier.replace('legacy-email-change:', ''),
          };
          break;
        }
      } catch (e) {
        if (e instanceof ValidationError) throw e;
        // Invalid JSON, skip this row
        continue;
      }
    }

    if (!matchedVerification) {
      throw new ValidationError({ message: t({ key: 'auth.migration.invalidOrExpiredLink' }) });
    }

    // Update the email in ba_user table
    await authPool.query('UPDATE ba_user SET email = $1, "emailVerified" = true, "updatedAt" = NOW() WHERE id = $2', [
      matchedVerification.newEmail,
      matchedVerification.authUserId,
    ]);

    // Delete the verification record
    await authPool.query('DELETE FROM ba_verification WHERE identifier = $1', [matchedVerification.identifier]);

    logger.info(
      `Legacy email migration completed for user ${matchedVerification.authUserId} to ${matchedVerification.newEmail}`,
    );

    return { data: { success: true, email: matchedVerification.newEmail } };
  },
);
