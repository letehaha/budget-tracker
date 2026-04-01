<template>
  <Card class="max-w-4xl">
    <CardHeader class="border-b">
      <h2 class="mb-2 text-2xl font-semibold">AI Integrations</h2>
      <p class="text-muted-foreground text-sm">
        Connect AI assistants like Claude or ChatGPT to analyze your financial data directly from chat.
      </p>
    </CardHeader>

    <CardContent class="mt-6 flex flex-col gap-6">
      <!-- MCP Server Info -->
      <div>
        <h3 class="mb-2 text-lg font-medium">MCP Server</h3>
        <p class="text-muted-foreground mb-4 text-sm leading-relaxed">
          Use this URL to connect AI assistants to your MoneyMatter account. Your data is shared read-only.
        </p>

        <div class="bg-muted flex items-center gap-2 rounded-lg p-3">
          <code class="flex-1 truncate text-sm">{{ mcpServerUrl }}</code>
          <DesktopOnlyTooltip content="Copy URL">
            <UiButton variant="outline" size="icon-sm" @click="copyUrl">
              <CopyIcon v-if="!copied" class="size-4" />
              <CheckIcon v-else class="size-4" />
            </UiButton>
          </DesktopOnlyTooltip>
        </div>
      </div>

      <Separator />

      <!-- Quick Connect Buttons -->
      <div>
        <h3 class="mb-2 text-lg font-medium">Quick Connect</h3>
        <p class="text-muted-foreground mb-4 text-sm leading-relaxed">
          Click a button to open the AI assistant's settings page where you can paste the MCP server URL.
        </p>

        <div class="flex flex-wrap gap-3">
          <UiButton variant="outline" class="gap-2" @click="openClaudeSettings">
            <SparklesIcon class="size-4" />
            Connect to Claude
          </UiButton>
          <UiButton variant="outline" class="gap-2" @click="openChatGptSettings">
            <BotIcon class="size-4" />
            Connect to ChatGPT
          </UiButton>
        </div>
      </div>

      <Separator />

      <!-- Connected Apps -->
      <div>
        <h3 class="mb-2 text-lg font-medium">Connected Apps</h3>
        <p class="text-muted-foreground mb-4 text-sm leading-relaxed">
          Apps that have access to your financial data. You can revoke access at any time.
        </p>

        <div v-if="isLoading" class="flex items-center justify-center py-8">
          <Loader2Icon class="text-muted-foreground size-6 animate-spin" />
        </div>

        <div v-else-if="!connectedApps?.length" class="text-muted-foreground py-8 text-center text-sm">
          <PlugIcon class="text-muted-foreground mx-auto mb-2 size-8" />
          <p>No apps connected yet.</p>
          <p class="mt-1">Use the buttons above to connect an AI assistant.</p>
        </div>

        <div v-else class="flex flex-col gap-3">
          <div
            v-for="app in connectedApps"
            :key="app.clientId"
            class="border-border flex items-center justify-between rounded-lg border p-4"
          >
            <div class="min-w-0 flex-1">
              <div class="font-medium">{{ app.name || app.clientId }}</div>
              <div class="text-muted-foreground mt-1 text-xs">
                Connected: {{ formatDate(app.connectedAt) }}
                <span v-if="app.lastUsedAt"> &middot; Last used: {{ formatRelative(app.lastUsedAt) }}</span>
              </div>
              <div class="text-muted-foreground mt-1 text-xs">Scope: {{ formatScopes(app.scopes) }}</div>
            </div>

            <UiButton variant="soft-destructive" size="sm" :disabled="isRevoking" @click="handleRevoke(app.clientId)">
              Revoke
            </UiButton>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>

  <ResponsiveAlertDialog
    v-model:open="isRevokeDialogOpen"
    confirm-label="Revoke Access"
    confirm-variant="destructive"
    @confirm="confirmRevoke"
  >
    <template #title>Revoke access?</template>
    <template #description>
      This will immediately disconnect the app and invalidate all its tokens. You can reconnect later.
    </template>
  </ResponsiveAlertDialog>
</template>

<script setup lang="ts">
import { getConnectedApps, getMcpServerUrl, revokeConnectedApp } from '@/api/mcp';
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { Separator } from '@/components/lib/ui/separator';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { useNotificationCenter } from '@/components/notification-center';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useClipboard } from '@vueuse/core';
import { format, formatDistanceToNow } from 'date-fns';
import { BotIcon, CheckIcon, CopyIcon, Loader2Icon, PlugIcon, SparklesIcon } from 'lucide-vue-next';
import { ref } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';

const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const queryClient = useQueryClient();

const isRevoking = ref(false);
const isRevokeDialogOpen = ref(false);
const revokeTargetClientId = ref<string | null>(null);

const mcpServerUrl = getMcpServerUrl();

const { copy, copied } = useClipboard({ source: mcpServerUrl });

const { data: connectedApps, isLoading } = useQuery({
  queryKey: VUE_QUERY_CACHE_KEYS.mcpConnectedApps,
  queryFn: getConnectedApps,
  placeholderData: [],
});

function copyUrl() {
  copy(mcpServerUrl);
  addSuccessNotification('MCP server URL copied to clipboard');
}

function openClaudeSettings() {
  window.open('https://claude.ai/settings/integrations', '_blank');
}

function openChatGptSettings() {
  window.open('https://chatgpt.com/settings', '_blank');
}

function formatDate(dateStr: string) {
  return format(new Date(dateStr), 'MMM d, yyyy');
}

function formatRelative(dateStr: string) {
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
}

function formatScopes(scopes: string[]) {
  const labels: Record<string, string> = {
    'finance:read': 'Read financial data',
    'profile:read': 'Read profile',
    offline_access: 'Offline access',
  };
  return scopes.map((s) => labels[s] || s).join(', ');
}

function handleRevoke(clientId: string) {
  revokeTargetClientId.value = clientId;
  isRevokeDialogOpen.value = true;
}

async function confirmRevoke() {
  if (!revokeTargetClientId.value) return;

  isRevoking.value = true;
  try {
    await revokeConnectedApp({ clientId: revokeTargetClientId.value });
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.mcpConnectedApps });
    addSuccessNotification('App access revoked successfully');
  } catch {
    addErrorNotification('Failed to revoke app access');
  } finally {
    isRevoking.value = false;
    isRevokeDialogOpen.value = false;
    revokeTargetClientId.value = null;
  }
}
</script>
