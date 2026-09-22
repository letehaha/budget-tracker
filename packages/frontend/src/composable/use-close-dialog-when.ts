import { ROUTES_NAMES } from '@/routes/constants';
import { type MaybeRefOrGetter, computed, toValue, watch } from 'vue';
import { useRoute } from 'vue-router';

export function useCloseDialogWhen({ when, close }: { when: MaybeRefOrGetter<boolean>; close: () => void }) {
  watch(
    () => toValue(when),
    (shouldClose) => shouldClose && close(),
  );
}

/** For dialogs whose "See plans" link would otherwise leave them open over the billing page. */
export function useIsBillingPage() {
  const route = useRoute();
  return computed(() => route.name === ROUTES_NAMES.settingsPlanBilling);
}
