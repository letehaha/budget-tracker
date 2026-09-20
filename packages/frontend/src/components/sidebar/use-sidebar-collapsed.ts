import { createSharedComposable, useLocalStorage } from '@vueuse/core';

export const useSidebarCollapsed = createSharedComposable(() => ({
  isCollapsed: useLocalStorage('sidebar:collapsed', false),
}));
