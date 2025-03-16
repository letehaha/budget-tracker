/* eslint-disable no-param-reassign */
import { debounce } from 'lodash-es';
import { Directive, DirectiveBinding } from 'vue';

interface ResizableElement extends HTMLElement {
  resizeObserver?: ResizeObserver;
  debouncedCallback?: ReturnType<typeof debounce>;
}

interface BindingValue {
  callback: () => void;
  debounceTime?: number;
}

export const nodeResizeObserver: Directive = {
  beforeMount(el: ResizableElement, binding: DirectiveBinding & { value: BindingValue }) {
    const { callback, debounceTime = 300 } = binding.value as BindingValue;

    if (!callback || typeof callback !== 'function') {
      throw new Error("v-node-resize-observer requires a 'callback' function.");
    }

    el.debouncedCallback = debounce(callback, debounceTime);

    el.resizeObserver = new ResizeObserver(el.debouncedCallback);
    el.resizeObserver.observe(el);
  },
  unmounted(el: ResizableElement) {
    if (el.resizeObserver) {
      el.resizeObserver.disconnect();
      el.resizeObserver = undefined;
    }

    if (el.debouncedCallback) {
      el.debouncedCallback.cancel();
      el.debouncedCallback = undefined;
    }
  },
};
