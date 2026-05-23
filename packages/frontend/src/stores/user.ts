import { loadUserData } from '@/api';
import { USER_ROLES, UserModel } from '@bt/shared/types';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export const useUserStore = defineStore('user', () => {
  const user = ref<UserModel | null>(null);
  const isUserExists = computed(() => Boolean(user.value));
  const isDemo = computed(() => user.value?.role === USER_ROLES.demo);
  const role = computed(() => user.value?.role ?? null);

  const loadUser = async () => {
    user.value = await loadUserData();
  };

  return {
    user,
    isUserExists,
    isDemo,
    role,
    loadUser,
  };
});
