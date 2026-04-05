<template>
  <div class="flex min-h-screen items-center justify-center p-4">
    <Card class="w-full max-w-md">
      <CardHeader class="text-center">
        <div class="bg-primary/10 mx-auto mb-4 flex size-16 items-center justify-center rounded-full">
          <ShieldCheckIcon class="text-primary size-8" />
        </div>
        <h1 class="text-xl font-semibold">{{ clientName }} wants to access your MoneyMatter data</h1>
      </CardHeader>

      <CardContent class="flex flex-col gap-6">
        <!-- What will be shared -->
        <div>
          <p class="text-muted-foreground mb-3 text-sm font-medium">This will allow {{ clientName }} to:</p>
          <ul class="space-y-2">
            <li class="flex items-center gap-2 text-sm">
              <CheckCircleIcon class="text-app-income-color size-4 shrink-0" />
              View your accounts and balances
            </li>
            <li class="flex items-center gap-2 text-sm">
              <CheckCircleIcon class="text-app-income-color size-4 shrink-0" />
              View your transactions
            </li>
            <li class="flex items-center gap-2 text-sm">
              <CheckCircleIcon class="text-app-income-color size-4 shrink-0" />
              View your budgets and spending stats
            </li>
            <li class="flex items-center gap-2 text-sm">
              <CheckCircleIcon class="text-app-income-color size-4 shrink-0" />
              View your categories and tags
            </li>
          </ul>
        </div>

        <Separator />

        <!-- What will NOT be shared -->
        <div>
          <p class="text-muted-foreground mb-3 text-sm font-medium">This will NOT allow {{ clientName }} to:</p>
          <ul class="space-y-2">
            <li class="flex items-center gap-2 text-sm">
              <XCircleIcon class="text-app-expense-color size-4 shrink-0" />
              Create, edit, or delete any data
            </li>
            <li class="flex items-center gap-2 text-sm">
              <XCircleIcon class="text-app-expense-color size-4 shrink-0" />
              Access your login credentials
            </li>
          </ul>
        </div>

        <Separator />

        <!-- Action Buttons -->
        <div class="flex gap-3">
          <UiButton variant="outline" class="flex-1" :disabled="isSubmitting" @click="submitConsent({ accept: false })">
            Deny
          </UiButton>
          <UiButton
            class="flex-1"
            :disabled="isSubmitting"
            :loading="isSubmitting"
            @click="submitConsent({ accept: true })"
          >
            Approve
          </UiButton>
        </div>

        <p class="text-muted-foreground text-center text-xs">
          You can revoke access at any time from Settings &gt; AI Integrations.
        </p>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { submitOAuthConsent } from '@/api/mcp';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { Separator } from '@/components/lib/ui/separator';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { getOAuthClientName } from '@/api/mcp';
import { CheckCircleIcon, ShieldCheckIcon, XCircleIcon } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const isSubmitting = ref(false);
const { addNotification } = useNotificationCenter();

const clientId = computed(() => (route.query.client_id as string) || '');
const fetchedClientName = ref<string | null>(null);

// Reconstruct the full signed OAuth query string to send back to better-auth
const oauthQuery = computed(() => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(route.query)) {
    if (value) params.set(key, String(value));
  }
  return params.toString();
});

onMounted(async () => {
  if (clientId.value) {
    try {
      const { name } = await getOAuthClientName({ clientId: clientId.value });
      fetchedClientName.value = name;
    } catch {
      // Fall through to fallback name
    }
  }
});

const clientName = computed(() => {
  if (fetchedClientName.value) return fetchedClientName.value;
  return clientId.value || 'An application';
});

async function submitConsent({ accept }: { accept: boolean }) {
  isSubmitting.value = true;
  try {
    const response = await submitOAuthConsent({ oauthQuery: oauthQuery.value, accept });

    if (response.redirected) {
      window.location.href = response.url;
      return;
    }

    if (response.ok) {
      const data = await response.json();
      // better-auth returns the redirect URL as `url` or `redirectTo`
      const redirectUrl = data.url || data.redirectTo;
      if (redirectUrl) {
        window.location.href = redirectUrl;
        return;
      }
    }

    if (!accept) {
      window.close();
      return;
    }

    // If we get here, something unexpected happened
    addNotification({
      id: 'oauth-consent-error',
      text: 'Unexpected response from server. Please try again.',
      type: NotificationType.error,
    });
    isSubmitting.value = false;
  } catch {
    addNotification({
      id: 'oauth-consent-error',
      text: 'Failed to process request. Please try again.',
      type: NotificationType.error,
    });
    isSubmitting.value = false;
  }
}
</script>
