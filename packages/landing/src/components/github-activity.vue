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
    <p class="text-muted-foreground flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs">
      <span>Built by one developer, in the open</span>
      <template v-if="starsLabel">
        <span class="text-muted-foreground/50">|</span>
        <a
          href="https://github.com/letehaha/budget-tracker"
          target="_blank"
          rel="noopener noreferrer"
          class="hover:text-foreground inline-flex items-center gap-1 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="#e3b341" class="size-3">
            <path
              d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"
            />
          </svg>
          {{ starsLabel }} stars on GitHub
        </a>
      </template>
    </p>
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
defineProps<{ starsLabel?: string | null }>();

import { fetchGitHubActivity } from '@/lib/github-api';
import type { GitHubActivityData } from '@/lib/github-api';
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

    if ('data' in response && response.data === null) {
      if (retryCount < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        return loadActivity(retryCount + 1);
      }
      return;
    }

    activity.value = response as GitHubActivityData;
  } catch (error) {
    console.error('Failed to fetch GitHub activity:', error);
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  loadActivity();
});
</script>
