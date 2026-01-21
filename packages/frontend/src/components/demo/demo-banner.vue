<template>
  <div
    v-if="isDemo"
    class="bg-primary/10 border-primary/20 flex items-center justify-center gap-2 border-b px-4 py-2 text-sm"
  >
    <AlertCircle class="text-primary size-4 shrink-0" />
    <span class="text-primary/90">
      <i18n-t keypath="demo.banner.message" tag="span">
        <template #time>
          <template v-if="timeRemaining"> ({{ t('demo.banner.resets', { time: timeRemaining }) }})</template>
        </template>
        <template #signUpLink>
          <button
            class="text-primary hover:text-primary/80 font-semibold underline underline-offset-2"
            @click="handleSignUpClick"
          >
            {{ t('demo.banner.signUp') }}
          </button>
        </template>
      </i18n-t>
    </span>
  </div>
</template>

<script setup lang="ts">
import { trackAnalyticsEvent } from '@/lib/posthog';
import { ROUTES_NAMES } from '@/routes/constants';
import { DEMO_EXPIRY_HOURS, useAuthStore, useUserStore } from '@/stores';
import { AlertCircle } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

const { t } = useI18n();

const router = useRouter();
const userStore = useUserStore();
const authStore = useAuthStore();
const { isDemo } = storeToRefs(userStore);

// Reactive time remaining calculation
const now = ref(Date.now());
let intervalId: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  // Update time every minute
  intervalId = setInterval(() => {
    now.value = Date.now();
  }, 60_000);
});

onUnmounted(() => {
  if (intervalId) {
    clearInterval(intervalId);
  }
});

// Calculate expiry timestamp once
const expiresAt = computed(() => {
  const demoSession = authStore.getDemoSession();
  if (!demoSession) return null;
  return demoSession.startedAt + DEMO_EXPIRY_HOURS * 60 * 60 * 1000;
});

// Check if demo has expired
const isExpired = computed(() => {
  if (!isDemo.value || !expiresAt.value) return false;
  return now.value >= expiresAt.value;
});

// Auto-logout when demo expires
watch(
  isExpired,
  async (expired) => {
    if (expired) {
      await authStore.logout();
      router.push({ name: ROUTES_NAMES.signIn, query: { reason: 'demo_expired' } });
    }
  },
  { immediate: true },
);

const timeRemaining = computed(() => {
  if (!expiresAt.value) return null;

  const remaining = expiresAt.value - now.value;

  if (remaining <= 0) return null;

  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));

  if (hours > 0) {
    return t('demo.banner.timeFormat.hoursMinutes', { hours, minutes });
  }
  return t('demo.banner.timeFormat.minutes', { minutes });
});

const handleSignUpClick = async () => {
  trackAnalyticsEvent({
    event: 'demo_signup_clicked',
    properties: { location: 'banner' },
  });

  // Logout demo user before redirecting to sign-up
  await authStore.logout();
  router.push({ name: ROUTES_NAMES.signUp });
};
</script>
