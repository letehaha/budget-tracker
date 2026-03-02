import { passkey } from '@better-auth/passkey';
import { OAUTH_PROVIDERS_LIST } from '@bt/shared/types';
import { createSessionHooks } from '@config/auth-hooks/session-hooks';
import { logger } from '@js/utils/logger';
import { identifyUser, trackSignup } from '@js/utils/posthog';
import { createUserWithDefaults } from '@services/user/create-user-with-defaults.service';
import bcrypt from 'bcryptjs';
import { betterAuth } from 'better-auth';
import { Pool } from 'pg';
import { Resend } from 'resend';

// Initialize Resend for transactional emails
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Track emails that were recently verified via changeEmail flow
// This prevents duplicate verification emails (better-auth bug workaround)
// See: https://github.com/better-auth/better-auth/issues/3742
const recentlyChangedEmails = new Map<string, number>();
const EMAIL_CHANGE_CACHE_TTL = 60_000; // 1 minute

// Create a separate pg Pool for better-auth
// This is required because better-auth uses raw SQL queries
const pool = new Pool({
  host: process.env.APPLICATION_DB_HOST,
  port: parseInt(process.env.APPLICATION_DB_PORT as string, 10),
  user: process.env.APPLICATION_DB_USERNAME,
  password: process.env.APPLICATION_DB_PASSWORD,
  // In test environment, use per-worker database (same as Sequelize)
  database:
    process.env.NODE_ENV === 'test' && process.env.JEST_WORKER_ID
      ? `${process.env.APPLICATION_DB_DATABASE}-${process.env.JEST_WORKER_ID}`
      : process.env.APPLICATION_DB_DATABASE,
});

export const auth = betterAuth({
  database: pool,
  basePath: '/api/v1/auth',
  baseURL: process.env.BETTER_AUTH_URL || 'https://localhost:8081',
  trustedOrigins: [process.env.AUTH_ORIGIN || 'https://localhost:8100'],

  // Custom table names with ba_ prefix to avoid conflicts
  user: {
    modelName: 'ba_user',
    // Enable email change for legacy users migration
    changeEmail: {
      enabled: true,
      // Send verification to the NEW email address (not the old one)
      // This is critical for legacy @app.migrated users who can't receive emails at their current address
      sendChangeEmailVerification: async ({ newEmail, url }) => {
        if (!resend) {
          logger.warn('Email change verification skipped: RESEND_API_KEY not configured');
          return;
        }

        const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
        const appName = process.env.AUTH_RP_NAME || 'MoneyMatter';

        try {
          const result = await resend.emails.send({
            from: `${appName} <${fromEmail}>`,
            to: newEmail, // Send to NEW email, not current
            subject: `Verify your new ${appName} email`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>Verify your new email</h2>
                <p>You requested to change your email address to this one. Click the button below to confirm:</p>
                <p style="margin: 24px 0;">
                  <a href="${url}" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                    Verify Email
                  </a>
                </p>
                <p style="color: #666; font-size: 14px;">
                  Or copy and paste this link: <br/>
                  <a href="${url}" style="color: #0070f3;">${url}</a>
                </p>
                <p style="color: #999; font-size: 12px; margin-top: 32px;">
                  If you didn't request this change, you can safely ignore this email.
                </p>
              </div>
            `,
          });
          logger.info(`Email change verification sent to ${newEmail}, resendId: ${result.data?.id}`);

          // Track this email to prevent duplicate verification email
          recentlyChangedEmails.set(newEmail, Date.now());
        } catch (error) {
          logger.error({ message: 'Failed to send email change verification', error: error as Error });
          throw error;
        }
      },
    },
  },
  session: {
    modelName: 'ba_session',
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Refresh session daily
  },
  account: {
    modelName: 'ba_account',
    // Allow auto-linking OAuth accounts to existing users with matching verified email
    // This is the standard behavior for most apps - if someone controls an OAuth account
    // with a verified email, they're the legitimate owner of that email
    accountLinking: {
      enabled: true,
      trustedProviders: [...OAUTH_PROVIDERS_LIST],
    },
  },
  verification: {
    modelName: 'ba_verification',
  },

  // Email and password authentication
  emailAndPassword: {
    enabled: true,
    // Require email verification for new signups (not legacy @app.migrated users)
    requireEmailVerification: Boolean(process.env.RESEND_API_KEY),
    // Use bcrypt compatible with existing password hashes
    password: {
      hash: async (password: string) => {
        const salt = bcrypt.genSaltSync(10);
        return bcrypt.hashSync(password, salt);
      },
      verify: async ({ password, hash }: { password: string; hash: string }) => {
        return bcrypt.compareSync(password, hash);
      },
    },
  },

  // Email verification via Resend
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      if (!resend) {
        logger.warn('Email verification skipped: RESEND_API_KEY not configured');
        return;
      }

      // Check if this email was recently changed via changeEmail flow
      // If so, skip sending duplicate verification (better-auth bug workaround)
      const changedAt = recentlyChangedEmails.get(user.email);
      if (changedAt && Date.now() - changedAt < EMAIL_CHANGE_CACHE_TTL) {
        logger.info(`Skipping duplicate verification email for ${user.email} (recently changed)`);
        recentlyChangedEmails.delete(user.email); // Clean up
        return;
      }

      const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
      const appName = process.env.AUTH_RP_NAME || 'MoneyMatter';

      try {
        const result = await resend.emails.send({
          from: `${appName} <${fromEmail}>`,
          to: user.email,
          subject: `Verify your ${appName} email`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>Welcome to ${appName}!</h2>
              <p>Please verify your email address by clicking the button below:</p>
              <p style="margin: 24px 0;">
                <a href="${url}" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                  Verify Email
                </a>
              </p>
              <p style="color: #666; font-size: 14px;">
                Or copy and paste this link: <br/>
                <a href="${url}" style="color: #0070f3;">${url}</a>
              </p>
              <p style="color: #999; font-size: 12px; margin-top: 32px;">
                If you didn't create an account, you can safely ignore this email.
              </p>
            </div>
          `,
        });
        logger.info(`Verification email sent to ${user.email}, resendId: ${result.data?.id}`);
      } catch (error) {
        logger.error({ message: 'Failed to send verification email', error: error as Error });
        throw error;
      }
    },
  },

  // OAuth providers
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      enabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
      enabled: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    },
  },

  // Plugins
  plugins: [
    passkey({
      rpID: process.env.AUTH_RP_ID || 'localhost',
      rpName: process.env.AUTH_RP_NAME || 'MoneyMatter',
      origin: process.env.AUTH_ORIGIN || 'https://localhost:8100',
      schema: {
        passkey: {
          modelName: 'ba_passkey',
        },
      },
    }),
  ],

  // Disable rate limiting in test/dev environments (including preview deploys).
  // better-auth enables it by default when NODE_ENV=production.
  rateLimit: {
    enabled: false,
  },

  // Advanced options
  advanced: {
    // Cookie settings for session
    cookiePrefix: 'bt_auth',
    useSecureCookies: process.env.NODE_ENV === 'production',
  },

  // Error handling - redirect OAuth errors to frontend callback page
  onAPIError: {
    errorURL: process.env.AUTH_ORIGIN
      ? `${process.env.AUTH_ORIGIN}/auth/callback`
      : 'https://localhost:8100/auth/callback',
  },

  // Callbacks for user lifecycle events
  databaseHooks: {
    user: {
      create: {
        // After a new auth user is created, create the app user profile
        after: async (user) => {
          try {
            logger.info(`Creating app user profile for auth user: ${user.id}`);

            const appUser = await createUserWithDefaults({
              username: user.name || user.email?.split('@')[0] || 'user',
              authUserId: user.id,
            });

            logger.info(`Successfully created app user profile with id: ${appUser.id}`);

            // Track signup in PostHog
            identifyUser({
              userId: appUser.id,
              properties: {
                email: user.email,
                username: appUser.username,
                createdAt: new Date().toISOString(),
              },
            });

            // Determine signup method based on accounts
            // Note: At this point we don't have easy access to the account type,
            // so we track it as 'email' by default. OAuth signups will be tracked
            // separately if needed.
            trackSignup({
              userId: appUser.id,
              email: user.email,
              username: appUser.username,
              method: 'email',
            });
          } catch (error) {
            logger.error({ message: 'Failed to create app user profile', error: error as Error });
            throw error;
          }
        },
      },
    },
    session: createSessionHooks({ pool }),
  },
});

// Also export the pool for migrations
export { pool as authPool };
