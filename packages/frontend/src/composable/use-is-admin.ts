import { useUserStore } from '@/stores';
import { computed } from 'vue';

/**
 * Composable to check if the current user has admin privileges
 * @returns Computed boolean indicating admin status
 */
export const useIsAdmin = () => {
  const userStore = useUserStore();

  const isAdmin = computed(() => {
    return userStore.user?.isAdmin === true;
  });

  return { isAdmin };
};
