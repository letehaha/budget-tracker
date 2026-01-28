<template>
  <div v-if="activity" class="flex flex-col items-center gap-3">
    <!-- Activity heatmap -->
    <div class="flex items-center gap-1">
      <div
        v-for="(commits, index) in activity.recentWeeksActivity"
        :key="index"
        class="size-3 rounded-sm transition-colors"
        :class="getActivityColor(commits)"
        :title="`Week ${index + 1}: ${commits} commits`"
      />
    </div>

    <!-- Stats text -->
    <div class="text-muted-foreground flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs">
      <span>{{ activity.commitsLast30Days }} commits in last 30 days</span>
      <span class="text-muted-foreground/50">|</span>
      <span>Last updated: {{ formatDate(activity.lastUpdated) }} · {{ formatRelative(activity.lastUpdated) }}</span>
    </div>

    <!-- Tagline -->
    <p class="text-muted-foreground text-xs">Built by an active solo developer</p>
  </div>

  <!-- Loading state -->
  <div v-else-if="isLoading" class="flex flex-col items-center gap-3">
    <div class="flex items-center gap-1">
      <div v-for="i in 12" :key="i" class="bg-muted size-3 animate-pulse rounded-sm" />
    </div>
    <div class="bg-muted h-3 w-48 animate-pulse rounded" />
  </div>
</template>

<script setup lang="ts">
import { type GitHubActivityData, fetchGitHubActivity } from '@/api/github';
import { onMounted, ref } from 'vue';

const activity = ref<GitHubActivityData | null>(null);
const isLoading = ref(true);

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

function getActivityColor(commits: number): string {
  if (commits === 0) return 'bg-muted';
  if (commits <= 5) return 'bg-green-500/30';
  if (commits <= 15) return 'bg-green-500/50';
  if (commits <= 30) return 'bg-green-500/70';
  return 'bg-green-500';
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatRelative(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return `${Math.floor(diffDays / 30)} months ago`;
}

async function loadActivity(retryCount = 0): Promise<void> {
  try {
    const response = await fetchGitHubActivity();

    // Check if response is the "computing" state (has data: null property)
    if ('data' in response && response.data === null) {
      if (retryCount < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        return loadActivity(retryCount + 1);
      }
      // Max retries reached, leave activity as null
      return;
    }

    // Response is GitHubActivityData directly
    activity.value = response as GitHubActivityData;
  } catch (error) {
    console.error('Failed to fetch GitHub activity:', error);
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  // Skip during prerendering (no backend available)
  const isPrerendering = navigator.userAgent.includes('HeadlessChrome');
  if (!isPrerendering) {
    loadActivity();
  }
});
</script>
