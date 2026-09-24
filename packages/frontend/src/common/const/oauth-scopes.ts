// `claudeai` is a Claude.ai client-registration workaround and has no user-visible
// meaning — hide it in the UI but still auto-grant it if requested.
export const HIDDEN_OAUTH_SCOPES = new Set(['claudeai']);
