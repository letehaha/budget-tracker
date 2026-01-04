<template>
  <div class="space-y-6">
    <div>
      <h3 class="mb-1 text-lg font-medium">Active Sessions</h3>
      <p class="text-muted-foreground text-sm">Manage devices where you're currently signed in</p>
    </div>

    <!-- Loading state -->
    <div v-if="isLoading" class="flex items-center justify-center py-8">
      <Loader2Icon class="text-muted-foreground size-6 animate-spin" />
    </div>

    <template v-else>
      <!-- Session list -->
      <div class="space-y-3">
        <div
          v-for="session in sessions"
          :key="session.id"
          :class="['border-border rounded-lg border p-4', session.isCurrent && 'border-primary/50 bg-primary/5']"
        >
          <div class="flex items-start justify-between">
            <div class="flex items-start gap-3">
              <div class="bg-muted flex size-10 items-center justify-center rounded-lg">
                <component :is="getDeviceIcon(session.userAgent)" class="text-muted-foreground size-5" />
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <p class="font-medium">{{ parseUserAgent(session.userAgent) }}</p>
                  <span
                    v-if="session.isCurrent"
                    class="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium"
                  >
                    Current
                  </span>
                </div>
                <p class="text-muted-foreground text-sm">
                  {{ session.ipAddress || 'Unknown location' }}
                </p>
                <p class="text-muted-foreground text-xs">
                  Last active: {{ formatDate(session.updatedAt || session.createdAt) }}
                </p>
              </div>
            </div>
            <Button
              v-if="!session.isCurrent"
              variant="ghost-destructive"
              size="sm"
              :disabled="isRevokingSession === session.token"
              @click="handleRevokeSession(session.token)"
            >
              <Loader2Icon v-if="isRevokingSession === session.token" class="size-4 animate-spin" />
              <LogOutIcon v-else class="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <!-- No sessions message -->
      <p v-if="sessions.length === 0" class="text-muted-foreground py-8 text-center text-sm">
        No active sessions found
      </p>

      <!-- Revoke all button -->
      <div v-if="otherSessions.length > 0" class="border-t pt-4">
        <Button variant="destructive" @click="handleRevokeAll">
          <LogOutIcon class="mr-2 size-4" />
          Sign out of all other sessions
        </Button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { Button } from '@/components/lib/ui/button';
import { useNotificationCenter } from '@/components/notification-center';
import { authClient, getSession } from '@/lib/auth-client';
import { Loader2Icon, LogOutIcon, MonitorIcon, SmartphoneIcon, TabletIcon } from 'lucide-vue-next';
import { type Component, computed, onMounted, ref } from 'vue';

interface Session {
  id: string;
  userId: string;
  token: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  isCurrent?: boolean;
}

const { addErrorNotification, addSuccessNotification } = useNotificationCenter();

const isLoading = ref(true);
const isRevokingSession = ref<string | null>(null);
const sessions = ref<Session[]>([]);
const currentSessionToken = ref<string | null>(null);

const otherSessions = computed(() => sessions.value.filter((s) => !s.isCurrent));

const formatDate = (dateStr: string | Date) => {
  const date = dateStr instanceof Date ? dateStr : new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

  return date.toLocaleDateString();
};

const parseUserAgent = (userAgent: string | null): string => {
  if (!userAgent) return 'Unknown Device';

  // Simple parsing for common browsers
  if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
    const match = userAgent.match(/Chrome\/(\d+)/);
    return `Chrome ${match?.[1] || ''}`;
  }
  if (userAgent.includes('Firefox')) {
    const match = userAgent.match(/Firefox\/(\d+)/);
    return `Firefox ${match?.[1] || ''}`;
  }
  if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
    const match = userAgent.match(/Version\/(\d+)/);
    return `Safari ${match?.[1] || ''}`;
  }
  if (userAgent.includes('Edg')) {
    const match = userAgent.match(/Edg\/(\d+)/);
    return `Edge ${match?.[1] || ''}`;
  }

  return 'Unknown Browser';
};

const getDeviceIcon = (userAgent: string | null): Component => {
  if (!userAgent) return MonitorIcon;

  if (userAgent.includes('Mobile') || userAgent.includes('Android') || userAgent.includes('iPhone')) {
    return SmartphoneIcon;
  }
  if (userAgent.includes('iPad') || userAgent.includes('Tablet')) {
    return TabletIcon;
  }

  return MonitorIcon;
};

const loadSessions = async () => {
  try {
    // Get current session to identify it
    const currentSession = await getSession();
    if (currentSession?.data?.session) {
      currentSessionToken.value = currentSession.data.session.token;
    }

    const result = await authClient.listSessions();
    if (result.data) {
      sessions.value = result.data.map((s: Session) => ({
        ...s,
        isCurrent: s.token === currentSessionToken.value,
      }));
      // Sort so current session is first
      sessions.value.sort((a, b) => (a.isCurrent ? -1 : b.isCurrent ? 1 : 0));
    }
  } catch (e) {
    console.error('Failed to load sessions:', e);
    addErrorNotification('Failed to load sessions');
  }
};

const handleRevokeSession = async (token: string) => {
  try {
    isRevokingSession.value = token;
    await authClient.revokeSession({ token: token });
    addSuccessNotification('Session revoked');
    await loadSessions();
  } catch {
    addErrorNotification('Failed to revoke session');
  } finally {
    isRevokingSession.value = null;
  }
};

const handleRevokeAll = async () => {
  try {
    await authClient.revokeOtherSessions();
    addSuccessNotification('All other sessions have been signed out');
    await loadSessions();
  } catch {
    addErrorNotification('Failed to revoke sessions');
  }
};

onMounted(async () => {
  isLoading.value = true;
  await loadSessions();
  isLoading.value = false;
});
</script>
