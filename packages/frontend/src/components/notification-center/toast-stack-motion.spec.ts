import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { HEIGHT_RELEASE_MS, createToastStackMotion } from './toast-stack-motion';

const GAP_PX = 14;

/**
 * Mirrors how sonner positions a bottom-anchored stack: heights are recorded once at mount, a
 * dismissed toast freezes its own offset, and its recorded height only leaves the list long after
 * the element itself is gone.
 */
const createSonnerStack = () => {
  const list = document.createElement('ol');
  list.setAttribute('data-sonner-toaster', '');
  list.style.setProperty('--gap', `${GAP_PX}px`);
  document.body.append(list);

  const elements = new Map<string, HTMLElement>();
  const heights = new Map<string, number>();
  const frozenOffsets = new Map<string, number>();
  let heightOrder: string[] = [];

  const offsetOf = ({ id }: { id: string }) => {
    const index = heightOrder.indexOf(id);
    const before = heightOrder.slice(0, index).reduce((total, other) => total + (heights.get(other) ?? 0), 0);
    return index * GAP_PX + before;
  };

  const applyOffsets = () => {
    elements.forEach((element, id) => {
      const offset = frozenOffsets.get(id) ?? offsetOf({ id });
      element.style.setProperty('--offset', `${offset}px`);
    });
  };

  return {
    list,
    mount: ({ id, height }: { id: string; height: number }) => {
      const element = document.createElement('li');
      element.setAttribute('data-sonner-toast', '');
      element.dataset.mounted = 'true';
      element.dataset.expanded = 'true';

      const content = document.createElement('div');
      content.setAttribute('data-content', '');
      element.append(content);

      list.prepend(element);
      elements.set(id, element);
      heights.set(id, height);
      heightOrder = [id, ...heightOrder];
      applyOffsets();
    },
    dismiss: ({ id }: { id: string }) => {
      frozenOffsets.set(id, offsetOf({ id }));
      elements.get(id)!.dataset.removed = 'true';
      applyOffsets();
    },
    unmount: ({ id }: { id: string }) => {
      elements.get(id)!.remove();
      elements.delete(id);
      applyOffsets();
    },
    reclaimHeight: ({ id }: { id: string }) => {
      heightOrder = heightOrder.filter((other) => other !== id);
      heights.delete(id);
      applyOffsets();
    },
    renderedOffsetOf: ({ id }: { id: string }) => {
      const element = elements.get(id)!;
      const offset = Number.parseFloat(element.style.getPropertyValue('--offset'));
      const lead = Number.parseFloat(element.style.getPropertyValue('--removed-lead'));
      return offset - (Number.isFinite(lead) ? lead : 0);
    },
  };
};

const stubContentHeights = ({ toast, full, clamped }: { toast: HTMLElement; full: number; clamped: number }) => {
  const content = toast.querySelector<HTMLElement>('[data-content]')!;
  content.getBoundingClientRect = () =>
    ({ height: toast.hasAttribute('data-measure-expanded') ? full : clamped }) as DOMRect;
};

describe('toast stack motion', () => {
  let stack: ReturnType<typeof createSonnerStack>;
  let isExpanded: boolean;
  let motion: ReturnType<typeof createToastStackMotion>;

  let forwardPointerOver: (event: Event) => void;
  let forwardFocusIn: (event: Event) => void;

  const hoverToast = ({ element }: { element: HTMLElement }) => {
    element.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
  };

  const focusToast = ({ element }: { element: HTMLElement }) => {
    element.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  };

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    isExpanded = true;
    stack = createSonnerStack();
    motion = createToastStackMotion({ getList: () => stack.list, getIsExpanded: () => isExpanded });
    forwardPointerOver = (event) => motion.handlePointerOver({ event: event as PointerEvent });
    forwardFocusIn = (event) => motion.handlePointerOver({ event: event as FocusEvent });
    document.addEventListener('pointerover', forwardPointerOver);
    document.addEventListener('focusin', forwardFocusIn);
  });

  afterEach(() => {
    document.removeEventListener('pointerover', forwardPointerOver);
    document.removeEventListener('focusin', forwardFocusIn);
    vi.useRealTimers();
  });

  test('inline offsets are readable', () => {
    stack.mount({ id: 'a', height: 60 });
    expect(stack.renderedOffsetOf({ id: 'a' })).toBe(0);
  });

  test('a dismissed toast closes its slot at once and stays put until sonner catches up', () => {
    stack.mount({ id: 'c', height: 100 });
    stack.mount({ id: 'b', height: 80 });
    stack.mount({ id: 'a', height: 60 });
    motion.syncStack();

    expect(stack.renderedOffsetOf({ id: 'c' })).toBe(2 * GAP_PX + 140);

    const snapWhileCommitting: boolean[] = [];
    stack.list.getBoundingClientRect = () => {
      snapWhileCommitting.push(stack.list.hasAttribute('data-removal-snap'));
      return {} as DOMRect;
    };

    stack.dismiss({ id: 'b' });
    motion.syncStack();
    expect(stack.renderedOffsetOf({ id: 'c' })).toBe(GAP_PX + 60);

    // The snap must not outlive the call that writes the leads, or it flattens every later transform.
    expect(snapWhileCommitting).toEqual([true]);
    expect(stack.list.hasAttribute('data-removal-snap')).toBe(false);

    stack.unmount({ id: 'b' });
    motion.syncStack();
    expect(stack.renderedOffsetOf({ id: 'c' })).toBe(GAP_PX + 60);

    stack.reclaimHeight({ id: 'b' });
    motion.syncStack();
    expect(stack.renderedOffsetOf({ id: 'c' })).toBe(GAP_PX + 60);
    expect(stack.list.querySelector('li')!.style.getPropertyValue('--removed-lead')).toBe('');
  });

  test('a toast mounting before the removed height is reclaimed still lands in the compacted stack', () => {
    stack.mount({ id: 'c', height: 100 });
    stack.mount({ id: 'b', height: 80 });
    stack.mount({ id: 'a', height: 60 });
    motion.syncStack();

    stack.dismiss({ id: 'b' });
    motion.syncStack();
    stack.unmount({ id: 'b' });
    motion.syncStack();

    stack.mount({ id: 'd', height: 40 });
    motion.syncStack();
    expect(stack.renderedOffsetOf({ id: 'a' })).toBe(GAP_PX + 40);
    expect(stack.renderedOffsetOf({ id: 'c' })).toBe(2 * GAP_PX + 100);

    stack.reclaimHeight({ id: 'b' });
    motion.syncStack();
    expect(stack.renderedOffsetOf({ id: 'a' })).toBe(GAP_PX + 40);
    expect(stack.renderedOffsetOf({ id: 'c' })).toBe(2 * GAP_PX + 100);
  });

  test('a height release coalesced with a mount still retires the lead it paid for', () => {
    stack.mount({ id: 'c', height: 100 });
    stack.mount({ id: 'b', height: 80 });
    stack.mount({ id: 'a', height: 60 });
    motion.syncStack();

    stack.dismiss({ id: 'b' });
    motion.syncStack();
    stack.unmount({ id: 'b' });
    motion.syncStack();

    // The mount adds exactly what the release takes away, so no survivor offset moves.
    stack.reclaimHeight({ id: 'b' });
    stack.mount({ id: 'd', height: 80 });
    motion.syncStack();

    vi.advanceTimersByTime(HEIGHT_RELEASE_MS);

    expect(stack.renderedOffsetOf({ id: 'a' })).toBe(GAP_PX + 80);
    expect(stack.renderedOffsetOf({ id: 'c' })).toBe(2 * GAP_PX + 140);
  });

  test('rapid dismissals compact without double counting', () => {
    stack.mount({ id: 'c', height: 100 });
    stack.mount({ id: 'b', height: 80 });
    stack.mount({ id: 'a', height: 60 });
    motion.syncStack();

    stack.dismiss({ id: 'b' });
    motion.syncStack();
    stack.dismiss({ id: 'a' });
    motion.syncStack();

    expect(stack.renderedOffsetOf({ id: 'c' })).toBe(0);

    stack.unmount({ id: 'b' });
    motion.syncStack();
    stack.unmount({ id: 'a' });
    motion.syncStack();
    expect(stack.renderedOffsetOf({ id: 'c' })).toBe(0);

    stack.reclaimHeight({ id: 'b' });
    motion.syncStack();
    stack.reclaimHeight({ id: 'a' });
    motion.syncStack();
    expect(stack.renderedOffsetOf({ id: 'c' })).toBe(0);
  });

  test('two dismissals seen in a single batch compact once each', () => {
    stack.mount({ id: 'c', height: 100 });
    stack.mount({ id: 'b', height: 80 });
    stack.mount({ id: 'a', height: 60 });
    motion.syncStack();

    stack.dismiss({ id: 'a' });
    stack.dismiss({ id: 'b' });
    motion.syncStack();

    expect(stack.renderedOffsetOf({ id: 'c' })).toBe(0);
  });

  test('hovering lifts only the toasts rendered above the hovered one', () => {
    stack.mount({ id: 'c', height: 100 });
    stack.mount({ id: 'b', height: 80 });
    stack.mount({ id: 'a', height: 60 });
    motion.syncStack();

    const [newest, hovered, oldest] = Array.from(stack.list.children) as HTMLElement[];
    stubContentHeights({ toast: hovered!, full: 130, clamped: 80 });

    hoverToast({ element: hovered! });

    expect(oldest!.style.getPropertyValue('--push-up')).toBe('50px');
    expect(hovered!.style.getPropertyValue('--push-up')).toBe('');
    expect(newest!.style.getPropertyValue('--push-up')).toBe('');
    expect(hovered!.hasAttribute('data-measure-expanded')).toBe(false);
    expect(hovered!.hasAttribute('data-measure-clamped')).toBe(false);

    hoverToast({ element: stack.list });
    expect(oldest!.style.getPropertyValue('--push-up')).toBe('');
  });

  test('focusing a toast lifts the stack the same way hovering does', () => {
    stack.mount({ id: 'b', height: 80 });
    stack.mount({ id: 'a', height: 60 });
    motion.syncStack();

    const [focused, oldest] = Array.from(stack.list.children) as HTMLElement[];
    stubContentHeights({ toast: focused!, full: 90, clamped: 60 });

    focusToast({ element: focused! });

    expect(oldest!.style.getPropertyValue('--push-up')).toBe('30px');
  });

  test('a toast hovered before the stack fans out is measured on the next sync', () => {
    stack.mount({ id: 'b', height: 80 });
    stack.mount({ id: 'a', height: 60 });

    const [hovered, oldest] = Array.from(stack.list.children) as HTMLElement[];
    stubContentHeights({ toast: hovered!, full: 90, clamped: 60 });
    hovered!.dataset.expanded = 'false';
    oldest!.dataset.expanded = 'false';

    hoverToast({ element: hovered! });
    expect(oldest!.style.getPropertyValue('--push-up')).toBe('');

    hovered!.dataset.expanded = 'true';
    oldest!.dataset.expanded = 'true';
    motion.syncStack();

    expect(oldest!.style.getPropertyValue('--push-up')).toBe('30px');
  });

  test('dismissing the hovered toast drops its lift', () => {
    stack.mount({ id: 'b', height: 80 });
    stack.mount({ id: 'a', height: 60 });
    motion.syncStack();

    const [hovered, oldest] = Array.from(stack.list.children) as HTMLElement[];
    stubContentHeights({ toast: hovered!, full: 90, clamped: 60 });

    hoverToast({ element: hovered! });
    expect(oldest!.style.getPropertyValue('--push-up')).toBe('30px');

    stack.dismiss({ id: 'a' });
    motion.syncStack();

    expect(oldest!.style.getPropertyValue('--push-up')).toBe('');
    expect(stack.renderedOffsetOf({ id: 'b' })).toBe(0);
  });

  test('collapsing the stack drops every compensation', () => {
    stack.mount({ id: 'b', height: 80 });
    stack.mount({ id: 'a', height: 60 });
    motion.syncStack();

    stack.dismiss({ id: 'a' });
    motion.syncStack();
    expect(stack.renderedOffsetOf({ id: 'b' })).toBe(0);

    isExpanded = false;
    motion.syncStack();

    expect(stack.renderedOffsetOf({ id: 'b' })).toBe(GAP_PX + 60);
    expect(stack.list.hasAttribute('data-removal-snap')).toBe(false);
  });

  test('re-expanding while the dismissed toast is still mounted closes its slot again', () => {
    stack.mount({ id: 'c', height: 100 });
    stack.mount({ id: 'b', height: 80 });
    stack.mount({ id: 'a', height: 60 });
    motion.syncStack();

    stack.dismiss({ id: 'b' });
    motion.syncStack();

    isExpanded = false;
    motion.syncStack();
    isExpanded = true;
    motion.syncStack();

    expect(stack.renderedOffsetOf({ id: 'c' })).toBe(GAP_PX + 60);
  });

  test('a dismissal first seen while collapsed is compensated once the stack expands', () => {
    stack.mount({ id: 'c', height: 100 });
    stack.mount({ id: 'b', height: 80 });
    stack.mount({ id: 'a', height: 60 });
    motion.syncStack();

    isExpanded = false;
    motion.syncStack();

    stack.dismiss({ id: 'b' });
    motion.syncStack();

    isExpanded = true;
    motion.syncStack();

    expect(stack.renderedOffsetOf({ id: 'c' })).toBe(GAP_PX + 60);
  });
});
