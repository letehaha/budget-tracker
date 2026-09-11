import type { PlaceResult } from '@/common/utils/nominatim';
import { effectScope, nextTick, ref } from 'vue';

vi.mock('@/common/utils/nominatim', () => ({ reverseGeocode: vi.fn() }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ locale: { value: 'en' } }) }));

import { reverseGeocode } from '@/common/utils/nominatim';

import { useReverseGeocodedLabel } from './use-reverse-geocoded-label';

const DEBOUNCE_MS = 600;

const place = (label: string): PlaceResult => ({ latitude: 1, longitude: 2, label, secondary: '' });

const mount = ({
  enabled = true,
  latitude: initialLatitude = null,
  longitude: initialLongitude = null,
}: { enabled?: boolean; latitude?: number | null; longitude?: number | null } = {}) => {
  const latitude = ref<number | null>(initialLatitude);
  const longitude = ref<number | null>(initialLongitude);
  const isEnabled = ref(enabled);
  const scope = effectScope();
  const api = scope.run(() => useReverseGeocodedLabel({ latitude, longitude, enabled: isEnabled }))!;

  return { ...api, latitude, longitude, isEnabled };
};

const flush = async () => {
  await nextTick();
  await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
};

describe('useReverseGeocodedLabel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(reverseGeocode).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not geocode while disabled', async () => {
    const { latitude, longitude, label } = mount({ enabled: false });

    latitude.value = 50.45;
    longitude.value = 30.52;
    await flush();

    expect(reverseGeocode).not.toHaveBeenCalled();
    expect(label.value).toBeNull();
  });

  it('resolves coordinates that are already filled in at setup', async () => {
    vi.mocked(reverseGeocode).mockResolvedValue(place('Kyiv'));
    const { label } = mount({ latitude: 50.45, longitude: 30.52 });

    await flush();

    expect(reverseGeocode).toHaveBeenCalledTimes(1);
    expect(label.value).toBe('Kyiv');
  });

  it('resolves a label and does not refetch the same coordinates', async () => {
    vi.mocked(reverseGeocode).mockResolvedValue(place('Kyiv'));
    const { latitude, longitude, label, isResolving } = mount();

    latitude.value = 50.45;
    longitude.value = 30.52;
    await flush();

    expect(label.value).toBe('Kyiv');
    expect(isResolving.value).toBe(false);
    expect(reverseGeocode).toHaveBeenCalledTimes(1);

    latitude.value = 10;
    await nextTick();
    latitude.value = 50.45;
    await flush();

    expect(reverseGeocode).toHaveBeenCalledTimes(1);
  });

  it('keeps a caller-provided label when an earlier request resolves late', async () => {
    let resolvePending: (value: PlaceResult) => void = () => {};
    vi.mocked(reverseGeocode).mockReturnValue(
      new Promise<PlaceResult>((resolve) => {
        resolvePending = resolve;
      }),
    );
    const { latitude, longitude, label, setKnownLabel } = mount();

    latitude.value = 50.45;
    longitude.value = 30.52;
    await flush();

    setKnownLabel({ latitude: 52.52, longitude: 13.4, label: 'Berlin' });
    latitude.value = 52.52;
    longitude.value = 13.4;
    resolvePending(place('Kyiv'));
    await flush();

    expect(label.value).toBe('Berlin');
  });

  it('retries coordinates that resolved to no label', async () => {
    vi.mocked(reverseGeocode).mockResolvedValue(null);
    const { latitude, longitude, label } = mount();

    latitude.value = 50.45;
    longitude.value = 30.52;
    await flush();

    expect(label.value).toBeNull();
    expect(reverseGeocode).toHaveBeenCalledTimes(1);

    latitude.value = 10;
    await nextTick();
    latitude.value = 50.45;
    await flush();

    expect(reverseGeocode).toHaveBeenCalledTimes(2);
  });

  it('clears the label when the opt-in is turned off', async () => {
    vi.mocked(reverseGeocode).mockResolvedValue(place('Kyiv'));
    const { latitude, longitude, label, isEnabled } = mount();

    latitude.value = 50.45;
    longitude.value = 30.52;
    await flush();
    expect(label.value).toBe('Kyiv');

    isEnabled.value = false;
    await flush();

    expect(label.value).toBeNull();
  });
});
