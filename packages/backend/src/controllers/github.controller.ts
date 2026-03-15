import { createController } from '@controllers/helpers/controller-factory';
import { CacheClient } from '@js/utils/cache';
import { z } from 'zod';

const GITHUB_REPO = 'letehaha/budget-tracker';
const CACHE_TTL_SECONDS = 12 * 60 * 60; // 12 hours

interface GitHubActivityData {
  commitsLast30Days: number;
  lastUpdated: string;
  recentWeeksActivity: number[]; // commits per week for last 12 weeks
}

const githubCache = new CacheClient<GitHubActivityData>({
  ttl: CACHE_TTL_SECONDS,
  logPrefix: 'GitHubActivity',
});

const CACHE_KEY = 'github:activity';

async function fetchGitHubActivity(): Promise<GitHubActivityData | null> {
  const headers: HeadersInit = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'MoneyMatter-App',
  };

  // Add GitHub token if available (increases rate limit from 60 to 5000 req/hour)
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  // Fetch commit activity (weekly commits for last year)
  const statsResponse = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/stats/commit_activity`, { headers });

  // GitHub returns 202 when stats are being computed (first request triggers async computation)
  // In this case, the response body is empty or not an array
  if (statsResponse.status === 202) {
    return null; // Data is being computed, try again later
  }

  // Fetch repo info for last updated date
  const repoResponse = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, { headers });

  if (!statsResponse.ok || !repoResponse.ok) {
    throw new Error('Failed to fetch GitHub data');
  }

  const commitActivity = await statsResponse.json();
  const repoData = (await repoResponse.json()) as { pushed_at: string };

  // Validate that commitActivity is an array
  if (!Array.isArray(commitActivity)) {
    return null; // Data not ready yet
  }

  const typedCommitActivity = commitActivity as Array<{
    week: number;
    total: number;
    days: number[];
  }>;

  // Get last 12 weeks of activity for heatmap
  const last12Weeks = typedCommitActivity.slice(-12);
  const recentWeeksActivity = last12Weeks.map((week) => week.total);

  // Calculate commits in last ~30 days (last 4-5 weeks)
  const last5Weeks = typedCommitActivity.slice(-5);
  const commitsLast30Days = last5Weeks.reduce((sum, week) => sum + week.total, 0);

  return {
    commitsLast30Days,
    lastUpdated: repoData.pushed_at,
    recentWeeksActivity,
  };
}

export const getGitHubActivity = createController(z.object({}), async () => {
  // Try to get from cache first
  const cached = await githubCache.read(CACHE_KEY);

  // Only use cache if it has valid data (not null/incomplete)
  if (cached && cached.commitsLast30Days !== undefined && cached.recentWeeksActivity?.length > 0) {
    return { data: cached, cached: true };
  }

  // Clear any invalid cached data
  if (cached) {
    await githubCache.delete(CACHE_KEY);
  }

  // Fetch fresh data
  const data = await fetchGitHubActivity();

  // GitHub returns null when stats are being computed (202 response)
  // Return a "computing" status so frontend can handle it
  if (data === null) {
    return { data: null, cached: false, computing: true };
  }

  // Store in cache
  await githubCache.write({ key: CACHE_KEY, value: data });

  return { data, cached: false };
});
