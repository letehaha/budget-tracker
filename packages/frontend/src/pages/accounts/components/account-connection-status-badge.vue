<template>
  <RouterLink
    v-if="isActionable"
    :to="{ name: ROUTES_NAMES.accountIntegrationDetails, params: { connectionId: connectionId! } }"
    :class="pillClass"
  >
    {{ label }}
  </RouterLink>
  <span v-else :class="pillClass">
    {{ label }}
  </span>
</template>

<script setup lang="ts">
import { cn } from '@/lib/utils';
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

const BASE_PILL_CLASS = 'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold';

const pillClass = computed(() =>
  cn(BASE_PILL_CLASS, {
    'bg-success/20 text-success-text': props.kind === 'active',
    'bg-warning/20 text-warning-text': props.kind === 'expiring-soon',
    'bg-destructive/20 text-destructive-text': props.kind === 'expired' || props.kind === 'reauth',
  }),
);

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
