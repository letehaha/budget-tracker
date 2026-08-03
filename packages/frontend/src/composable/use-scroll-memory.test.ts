import { describe, expect, it } from 'vitest';
import { nextTick, ref } from 'vue';

import { useScrollMemory } from './use-scroll-memory';

const createScroller = ({ scrollTop = 0 } = {}) => ({ scrollTop }) as HTMLElement;

describe('useScrollMemory', () => {
  it('captures the position on leave and restores it on return', async () => {
    const element = ref<HTMLElement | null>(createScroller({ scrollTop: 420 }));
    const isAway = ref(false);

    const { savedScrollTop } = useScrollMemory({ element, isAway });

    isAway.value = true;
    await nextTick();
    expect(savedScrollTop.value).toBe(420);

    element.value = createScroller();
    isAway.value = false;
    await nextTick();
    await nextTick();
    expect(element.value.scrollTop).toBe(420);
  });

  it('treats a missing element as position zero', async () => {
    const element = ref<HTMLElement | null>(null);
    const isAway = ref(false);

    const { savedScrollTop } = useScrollMemory({ element, isAway });

    isAway.value = true;
    await nextTick();
    expect(savedScrollTop.value).toBe(0);

    isAway.value = false;
    await nextTick();
    await nextTick();
    expect(savedScrollTop.value).toBe(0);
  });

  it('does not scroll a view that mounted in the away state', async () => {
    const element = ref<HTMLElement | null>(createScroller({ scrollTop: 0 }));
    const isAway = ref(true);

    useScrollMemory({ element, isAway });

    isAway.value = false;
    await nextTick();
    await nextTick();
    expect(element.value?.scrollTop).toBe(0);
  });
});
