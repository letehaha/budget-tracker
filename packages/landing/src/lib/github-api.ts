export interface GitHubActivityData {
  commitsLast30Days: number;
  lastUpdated: string;
  recentWeeksActivity: number[];
}

type GitHubActivityResponse = GitHubActivityData | { data: null; cached: false; computing: true };

export async function fetchGitHubActivity(): Promise<GitHubActivityResponse> {
  const response = await fetch('/api/v1/github/activity');

  if (!response.ok) {
    throw new Error(`GitHub activity fetch failed: ${response.status}`);
  }

  const json = await response.json();
  return json.response;
}
