import { Directive } from 'vue';

export const clickOutside: Directive = {
  beforeMount(el, binding): void {
    // eslint-disable-next-line no-param-reassign
    el.clickOutsideEvent = (event: MouseEvent) => {
      // here I check that click was outside the el and his childrens
      if (!(el === event.target || el.contains(event.target))) {
        // and if it did, call method provided in attribute value
        binding.value(event);
      }
    };
    document.body.addEventListener('click', el.clickOutsideEvent);
  },
  beforeUnmount(el): void {
    document.body.removeEventListener('click', el.clickOutsideEvent);
  },
};
