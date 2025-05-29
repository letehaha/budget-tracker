import { SCROLL_AREA_IDS } from '@/components/lib/ui/scroll-area/types';
import { ScrollAreaViewport } from 'radix-vue';
import { Ref, inject, ref } from 'vue';

/**
 * Get a scroll container by ID
 */
export function useScrollAreaContainer(scrollAreaId: SCROLL_AREA_IDS): Ref<typeof ScrollAreaViewport | null> {
  return inject(scrollAreaId, ref(null));
}
