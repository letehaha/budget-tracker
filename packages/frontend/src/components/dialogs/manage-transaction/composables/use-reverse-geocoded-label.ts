import { reverseGeocode } from '@/common/utils/nominatim';
import { watchDebounced } from '@vueuse/core';
import { type Ref, computed, onScopeDispose, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const DEFAULT_DEBOUNCE_MS = 600;

/**
 * Resolves a human-readable address for a coordinate pair. Reverse geocoding hits OpenStreetMap,
 * so `enabled` must be the user's map-picker opt-in.
 */
export const useReverseGeocodedLabel = ({
  latitude,
  longitude,
  enabled,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: {
  latitude: Ref<number | null | undefined>;
  longitude: Ref<number | null | undefined>;
  enabled: Ref<boolean>;
  debounceMs?: number;
}) => {
  const { locale } = useI18n();

  const label = ref<string | null>(null);
  const isResolving = ref(false);

  let resolvedKey = '';
  let controller: AbortController | undefined;

  const key = computed(() =>
    latitude.value != null && longitude.value != null ? `${latitude.value},${longitude.value}` : '',
  );

  watchDebounced(
    [key, enabled],
    async ([currentKey, isEnabled]) => {
      controller?.abort();
      controller = undefined;

      if (!currentKey || !isEnabled) {
        label.value = null;
        resolvedKey = '';
        isResolving.value = false;
        return;
      }
      if (currentKey === resolvedKey) return;

      const currentLatitude = latitude.value;
      const currentLongitude = longitude.value;
      if (currentLatitude == null || currentLongitude == null) return;

      controller = new AbortController();
      const { signal } = controller;
      isResolving.value = true;

      try {
        const place = await reverseGeocode({
          latitude: currentLatitude,
          longitude: currentLongitude,
          signal,
          language: locale.value,
        });
        if (signal.aborted) return;
        label.value = place?.label ?? null;
        // Only a found label counts as resolved, so an empty answer is retried on the next change.
        if (label.value) resolvedKey = currentKey;
      } catch {
        if (signal.aborted) return;
        label.value = null;
      } finally {
        if (!signal.aborted) isResolving.value = false;
      }
    },
    { debounce: debounceMs, immediate: true },
  );

  /** Adopts a label the caller already knows (search result, picker confirmation) without a request. */
  const setKnownLabel = ({
    latitude: knownLatitude,
    longitude: knownLongitude,
    label: knownLabel,
  }: {
    latitude: number;
    longitude: number;
    label: string | null;
  }) => {
    controller?.abort();
    controller = undefined;
    isResolving.value = false;
    label.value = knownLabel;
    resolvedKey = knownLabel ? `${knownLatitude},${knownLongitude}` : '';
  };

  onScopeDispose(() => controller?.abort());

  return { label, isResolving, setKnownLabel };
};
