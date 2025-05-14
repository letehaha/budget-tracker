<script setup lang="ts">
import UiButton from '@/components/lib/ui/button/Button.vue';
import { ROUTES_NAMES } from '@/routes';
import { useAuthStore } from '@/stores';
import { LogOutIcon } from 'lucide-vue-next';
import { useRouter } from 'vue-router';

const router = useRouter();
const { logout } = useAuthStore();

const logOutHandler = () => {
  logout();
  router.push({ name: ROUTES_NAMES.signIn });
};
</script>

<template>
  <ui-button variant="secondary" class="mt-auto w-full justify-start gap-2 px-3" @click="logOutHandler">
    <LogOutIcon />
    <span> Logout </span>
  </ui-button>
</template>
