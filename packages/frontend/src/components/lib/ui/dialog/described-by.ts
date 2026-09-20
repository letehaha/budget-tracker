import { type InjectionKey, type Ref, computed, inject, onUnmounted, provide, ref } from 'vue';

const HAS_DESCRIPTION: InjectionKey<Ref<boolean>> = Symbol('dialog-has-description');

/**
 * reka points `aria-describedby` at its description id even when no description is rendered,
 * leaving a dangling reference. Spread the result onto reka's `DialogContent` to drop it then.
 */
export const useDescribedByAttrs = () => {
  const hasDescription = ref(false);
  provide(HAS_DESCRIPTION, hasDescription);

  return computed(() => (hasDescription.value ? {} : { 'aria-describedby': undefined }));
};

export const useRegisterDescription = () => {
  const hasDescription = inject(HAS_DESCRIPTION, null);
  if (!hasDescription) return;

  hasDescription.value = true;
  onUnmounted(() => {
    hasDescription.value = false;
  });
};
