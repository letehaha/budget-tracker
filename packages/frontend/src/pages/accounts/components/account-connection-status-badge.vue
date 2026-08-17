<template>
  <RouterLink
    v-if="isActionable"
    :to="{ name: ROUTES_NAMES.accountIntegrationDetails, params: { connectionId: connectionId! } }"
    class="shrink-0"
  >
    <StatusBadge :variant="variant">{{ label }}</StatusBadge>
  </RouterLink>
  <StatusBadge v-else :variant="variant">{{ label }}</StatusBadge>
</template>

<script setup lang="ts">
import { StatusBadge } from '@/components/lib/ui/status-badge';
import type { ConnectionStatusKind } from '@/pages/accounts/connection-status';
import { ROUTES_NAMES } from '@/routes/constants';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';

const props = defineProps<{
  connectionId?: string;
  kind: ConnectionStatusKind;
}>();

const { t } = useI18n();

// Expired/reauth link to the connection so the user can fix it; expiring-soon
// links too so they can re-consent ahead of time. Active is informational only.
// With no connectionId the badge is a plain, non-linking pill.
const isActionable = computed(() => props.kind !== 'active' && props.connectionId != null);

const variant = computed(() => {
  switch (props.kind) {
    case 'active':
      return 'success' as const;
    case 'expiring-soon':
      return 'warning' as const;
    default:
      return 'destructive' as const;
  }
});

const label = computed(() => {
  switch (props.kind) {
    case 'active':
      return t('accounts.status.active');
    case 'expiring-soon':
      return t('accounts.status.expiringSoon');
    case 'expired':
      return t('accounts.status.expired');
    case 'reauth':
      return t('accounts.reconnect');
    default:
      return '';
  }
});
</script>
