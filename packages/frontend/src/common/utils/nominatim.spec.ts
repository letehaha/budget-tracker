import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatPlaceLabel, resetNominatimThrottleForTests, reverseGeocode, searchPlaces } from './nominatim';

const mockFetchOnce = (payload: unknown) => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

// The module throttles to 1 req/s, so every call is driven through fake timers. The settle handler
// is attached before the timers run, otherwise a rejection surfaces as an unhandled rejection.
const resolveThrottled = async <T>(promise: Promise<T>) => {
  const settled = promise.then(
    (value) => ({ ok: true as const, value }),
    (error) => ({ ok: false as const, error }),
  );
  await vi.runAllTimersAsync();
  const result = await settled;
  if (!result.ok) throw result.error;
  return result.value;
};

describe('nominatim', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetNominatimThrottleForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('formatPlaceLabel', () => {
    it('joins name, up to two localities and country', () => {
      expect(
        formatPlaceLabel({
          place: {
            lat: '50.45',
            lon: '30.52',
            name: 'Kyiv Coffee',
            display_name: 'Kyiv Coffee, Shevchenkivskyi, Kyiv, Ukraine',
            address: {
              suburb: 'Shevchenkivskyi',
              city: 'Kyiv',
              country: 'Ukraine',
            },
          },
        }),
      ).toBe('Kyiv Coffee, Shevchenkivskyi, Kyiv, Ukraine');
    });

    it('falls back to the first display_name segment when name is missing', () => {
      expect(
        formatPlaceLabel({
          place: {
            lat: '1',
            lon: '2',
            display_name: 'Main Street, Springfield, USA',
            address: { country: 'USA' },
          },
        }),
      ).toBe('Main Street, USA');
    });

    it('deduplicates repeated segments', () => {
      expect(
        formatPlaceLabel({
          place: {
            lat: '1',
            lon: '2',
            name: 'Kyiv',
            display_name: 'Kyiv, Kyiv, Ukraine',
            address: { city: 'Kyiv', town: 'Kyiv', country: 'Ukraine' },
          },
        }),
      ).toBe('Kyiv, Ukraine');
    });

    it('returns an empty string when there is nothing to show', () => {
      expect(formatPlaceLabel({ place: { lat: '1', lon: '2' } })).toBe('');
    });
  });

  describe('searchPlaces', () => {
    it('maps the response into PlaceResult entries', async () => {
      const fetchMock = mockFetchOnce([
        {
          lat: '50.4501',
          lon: '30.5234',
          name: 'Maidan Nezalezhnosti',
          display_name: 'Maidan Nezalezhnosti, Pechersk, Kyiv, Ukraine',
          address: { suburb: 'Pechersk', city: 'Kyiv', country: 'Ukraine' },
        },
      ]);

      const results = await resolveThrottled(searchPlaces({ query: 'maidan', language: 'en' }));

      expect(results).toEqual([
        {
          latitude: 50.4501,
          longitude: 30.5234,
          label: 'Maidan Nezalezhnosti, Pechersk, Kyiv, Ukraine',
          secondary: 'Pechersk, Kyiv, Ukraine',
        },
      ]);

      const requestedUrl = new URL(fetchMock.mock.calls[0]![0]);
      expect(requestedUrl.pathname).toBe('/search');
      expect(requestedUrl.searchParams.get('q')).toBe('maidan');
      expect(requestedUrl.searchParams.get('limit')).toBe('5');
      expect(requestedUrl.searchParams.get('accept-language')).toBe('en');
      expect(fetchMock.mock.calls[0]![1].signal).toBeInstanceOf(AbortSignal);
    });

    it('skips entries without coordinates and tolerates a non-array payload', async () => {
      mockFetchOnce([{ display_name: 'Nowhere' }]);
      expect(await resolveThrottled(searchPlaces({ query: 'nowhere', language: 'en' }))).toEqual([]);

      mockFetchOnce({ error: 'Unable to geocode' });
      expect(await resolveThrottled(searchPlaces({ query: 'nowhere', language: 'en' }))).toEqual([]);
    });

    it('keeps zero coordinates and drops unparseable ones', async () => {
      mockFetchOnce([
        { lat: '0', lon: '0', display_name: 'Null Island' },
        { lat: 'n/a', lon: '30.5234', display_name: 'Broken' },
      ]);

      expect(await resolveThrottled(searchPlaces({ query: 'null island', language: 'en' }))).toEqual([
        { latitude: 0, longitude: 0, label: 'Null Island', secondary: '' },
      ]);
    });

    it('throws on a non-ok response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429, statusText: 'Too Many Requests' }));
      await expect(resolveThrottled(searchPlaces({ query: 'maidan', language: 'en' }))).rejects.toThrow(
        'Nominatim /search failed: 429 Too Many Requests',
      );
    });
  });

  describe('throttling', () => {
    it('sends at most one request per second', async () => {
      const fetchMock = mockFetchOnce([]);

      const first = searchPlaces({ query: 'a', language: 'en' });
      const second = searchPlaces({ query: 'b', language: 'en' });

      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1000);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      await Promise.all([first, second]);
    });

    it('rejects a request aborted while it waits and leaves the next slot free', async () => {
      const fetchMock = mockFetchOnce([]);
      const controller = new AbortController();

      const first = searchPlaces({ query: 'a', language: 'en' });
      const aborted = searchPlaces({ query: 'b', language: 'en', signal: controller.signal });
      const abortedRejects = expect(aborted).rejects.toMatchObject({ name: 'AbortError' });

      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      controller.abort();
      await abortedRejects;

      await vi.advanceTimersByTimeAsync(1000);
      const third = searchPlaces({ query: 'c', language: 'en' });
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      await Promise.all([first, third]);
    });

    it('rejects an already aborted request without calling fetch', async () => {
      const fetchMock = mockFetchOnce([]);

      const signal = AbortSignal.abort();

      await expect(searchPlaces({ query: 'a', language: 'en', signal })).rejects.toMatchObject({ name: 'AbortError' });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('reverseGeocode', () => {
    it('maps the response into a PlaceResult', async () => {
      const fetchMock = mockFetchOnce({
        lat: '48.8584',
        lon: '2.2945',
        name: 'Eiffel Tower',
        display_name: 'Eiffel Tower, Gros-Caillou, Paris, France',
        address: { suburb: 'Gros-Caillou', city: 'Paris', country: 'France' },
      });

      expect(
        await resolveThrottled(
          reverseGeocode({
            latitude: 48.8584,
            longitude: 2.2945,
            language: 'en',
          }),
        ),
      ).toEqual({
        latitude: 48.8584,
        longitude: 2.2945,
        label: 'Eiffel Tower, Gros-Caillou, Paris, France',
        secondary: 'Gros-Caillou, Paris, France',
      });

      const requestedUrl = new URL(fetchMock.mock.calls[0]![0]);
      expect(requestedUrl.pathname).toBe('/reverse');
      expect(requestedUrl.searchParams.get('lat')).toBe('48.8584');
      expect(requestedUrl.searchParams.get('lon')).toBe('2.2945');
      expect(requestedUrl.searchParams.get('zoom')).toBe('16');
    });

    it('returns null when the payload carries no coordinates', async () => {
      mockFetchOnce({ error: 'Unable to geocode' });
      expect(await resolveThrottled(reverseGeocode({ latitude: 0, longitude: 0, language: 'en' }))).toBeNull();
    });

    it('returns null when a coordinate is not a number', async () => {
      mockFetchOnce({ lat: 'n/a', lon: '2.2945', display_name: 'Broken' });
      expect(await resolveThrottled(reverseGeocode({ latitude: 0, longitude: 0, language: 'en' }))).toBeNull();
    });
  });
});
