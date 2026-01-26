<template>
  <footer class="border-border/40 relative overflow-hidden border-t py-12">
    <!-- Background gradient -->
    <div class="pointer-events-none absolute inset-0">
      <div
        class="hero-orb hero-orb-1 absolute -bottom-1/2 left-1/2 size-150 -translate-x-1/2 rounded-full bg-linear-to-t from-purple-500/5 via-pink-500/5 to-transparent blur-3xl"
      />
    </div>

    <div class="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div class="flex flex-col flex-wrap items-center justify-between gap-6 sm:flex-row">
        <div class="flex w-full items-center justify-between gap-6 max-sm:flex-col">
          <!-- Logo -->
          <div class="flex items-center gap-2">
            <div
              class="from-primary flex size-8 items-center justify-center rounded-lg bg-linear-to-br to-purple-600"
            >
              <CircleDollarSign class="size-5 text-white" :stroke-width="2" />
            </div>
            <span class="font-semibold">MoneyMatter</span>
          </div>

          <!-- Links -->
          <div class="text-muted-foreground flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
            <a
              href="https://github.com/letehaha/budget-tracker"
              target="_blank"
              rel="noopener noreferrer"
              class="hover:text-foreground transition-colors"
              @click="$emit('github-click', 'footer')"
            >
              GitHub
            </a>
            <template v-if="isLoggedIn">
              <router-link :to="{ name: ROUTES_NAMES.home }" class="hover:text-foreground transition-colors">
                Dashboard
              </router-link>
            </template>
            <template v-else>
              <router-link :to="{ name: ROUTES_NAMES.signIn }" class="hover:text-foreground transition-colors">
                Sign In
              </router-link>
              <router-link :to="{ name: ROUTES_NAMES.signUp }" class="hover:text-foreground transition-colors">
                Sign Up
              </router-link>
            </template>
            <router-link :to="{ name: ROUTES_NAMES.privacyPolicy }" class="hover:text-foreground transition-colors">
              Privacy Policy
            </router-link>
            <router-link :to="{ name: ROUTES_NAMES.termsOfUse }" class="hover:text-foreground transition-colors">
              Terms of Use
            </router-link>
          </div>
        </div>

        <!-- Copyright -->
        <p class="text-muted-foreground mx-auto text-sm">
          &copy; {{ currentYear }} MoneyMatter. Open source under CC BY-NC-SA 4.0.
        </p>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { ROUTES_NAMES } from '@/routes';
import { CircleDollarSign } from 'lucide-vue-next';
import { computed } from 'vue';

defineProps<{
  isLoggedIn: boolean;
}>();

defineEmits<{
  'github-click': [location: string];
}>();

const currentYear = computed(() => new Date().getFullYear());
</script>

<style scoped>
.hero-orb-1 {
  animation:
    float-1 12s infinite,
    pulse 4s ease-in-out infinite;
}

@keyframes float-1 {
  0%,
  100% {
    transform: translate(0, 0);
  }
  33% {
    transform: translate(3%, 4%);
  }
  66% {
    transform: translate(-2%, -2%);
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.5;
    scale: 1;
  }
  50% {
    opacity: 0.8;
    scale: 1.15;
  }
}
</style>
