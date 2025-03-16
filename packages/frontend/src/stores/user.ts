import { loadUserData } from '@/api';
import { UserModel } from '@bt/shared/types';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export const useUserStore = defineStore('user', () => {
  const user = ref<UserModel | null>(null);
  const isUserExists = computed(() => Boolean(user.value));

  const loadUser = async () => {
    try {
      const result = await loadUserData();

      user.value = result;
    } catch (e) {}
  };

  return {
    user,
    isUserExists,
    loadUser,
  };
});
