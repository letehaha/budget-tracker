import { api } from './_api';

export interface GitHubActivityData {
  commitsLast30Days: number;
  lastUpdated: string;
  recentWeeksActivity: number[];
}

// The api.get() extracts the "response" field, so we get data directly
// Backend returns either the activity data or null with computing flag
type GitHubActivityResponse = GitHubActivityData | { data: null; cached: false; computing: true };

export async function fetchGitHubActivity(): Promise<GitHubActivityResponse> {
  // Silent mode: don't show error toasts for non-critical landing page data
  return api.get('/github/activity', undefined, { silent: true });
}
