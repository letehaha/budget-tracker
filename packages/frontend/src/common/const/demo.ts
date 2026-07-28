/**
 * Sign-in route's `reason` query param for an unprompted expiry. demo-banner.vue sets it
 * on auto-logout; login.vue reads it back to show a notice.
 */
export const DEMO_SESSION_EXPIRED_REASON = 'demo_expired';

/** How a demo session stopped. `logout` covers both an explicit sign-out and a session that stopped validating. */
export type DemoEndReason = 'signup_clicked' | 'logout' | 'expired';

/**
 * Closed set of controls demo mode refuses. Analytics groups on these exact names,
 * so a free-form string would let a typo fork one control into two series.
 */
export type DemoBlockedFeature =
  | 'add_passkey'
  | 'bank_connect_enablebanking'
  | 'bank_connect_enablebanking_import_accounts'
  | 'bank_connect_lunchflow'
  | 'bank_connect_lunchflow_import_accounts'
  | 'bank_connect_monobank'
  | 'bank_connect_monobank_import_accounts'
  | 'bank_connect_simplefin'
  | 'bank_connect_simplefin_import_accounts'
  | 'bank_connect_walutomat'
  | 'bank_connect_walutomat_import_accounts'
  | 'change_password'
  | 'connect_oauth_provider'
  | 'create_portfolio_empty_state'
  | 'create_portfolio_header'
  | 'delete_portfolio'
  | 'household_cancel_invite'
  | 'household_change_permission'
  | 'household_invitation_accept'
  | 'household_invitation_back_invite'
  | 'household_invitation_decline'
  | 'household_leave'
  | 'household_resend_invite'
  | 'household_revoke_member'
  | 'share_account_cancel_invite'
  | 'share_account_dialog_submit'
  | 'share_account_invite'
  | 'share_account_resend_invite'
  | 'share_account_revoke_member'
  | 'share_budget_cancel_invite'
  | 'share_budget_dialog_submit'
  | 'share_budget_invite'
  | 'share_budget_resend_invite'
  | 'share_budget_revoke_member'
  | 'share_invitation_accept'
  | 'share_invitation_decline';
