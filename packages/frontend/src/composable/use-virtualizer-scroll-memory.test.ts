import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';

import { useVirtualizerScrollMemory } from './use-virtualizer-scroll-memory';

const STORAGE_KEY = 'test-scroll-memory';

const mountList = ({ startIndex, itemsCount }: { startIndex: number; itemsCount: number }) => {
  const scrollToIndex = vi.fn();
  const wrapper = mount(
    defineComponent({
      setup() {
        const scrollElement = ref<HTMLElement | null>(null);
        useVirtualizerScrollMemory({
          storageKey: STORAGE_KEY,
          virtualizer: ref({ range: { startIndex, endIndex: startIndex + 10 }, scrollToIndex }),
          scrollElement,
          itemsCount,
        });
        return () => h('div', { ref: scrollElement });
      },
    }),
  );
  return { wrapper, scrollToIndex };
};

describe('useVirtualizerScrollMemory', () => {
  beforeEach(() => sessionStorage.clear());

  it('restores the first visible row after a remount', async () => {
    mountList({ startIndex: 42, itemsCount: 100 }).wrapper.unmount();

    const { wrapper, scrollToIndex } = mountList({ startIndex: 0, itemsCount: 100 });
    await wrapper.vm.$nextTick();

    expect(scrollToIndex).toHaveBeenCalledWith(42, { align: 'start' });
  });

  it('ignores a saved row that is past the loaded items', async () => {
    mountList({ startIndex: 42, itemsCount: 100 }).wrapper.unmount();

    const { wrapper, scrollToIndex } = mountList({ startIndex: 0, itemsCount: 20 });
    await wrapper.vm.$nextTick();

    expect(scrollToIndex).not.toHaveBeenCalled();
  });

  it('does not scroll on a first visit', async () => {
    const { wrapper, scrollToIndex } = mountList({ startIndex: 0, itemsCount: 100 });
    await wrapper.vm.$nextTick();

    expect(scrollToIndex).not.toHaveBeenCalled();
  });
});
