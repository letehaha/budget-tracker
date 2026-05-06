import { CategoryModel } from '@bt/shared/types';
import * as helpers from '@tests/helpers';

describe('Locale-aware signup', () => {
  /**
   * Helper to create a new user via signup endpoint with specific locale.
   * Returns the session cookies for the new user.
   */
  async function signupWithLocale({ email, locale }: { email: string; locale: string }): Promise<string> {
    const signupRes = await helpers.makeAuthRequest({
      method: 'post',
      url: '/auth/sign-up/email',
      payload: {
        email,
        password: 'testpassword123',
        name: `Test User ${locale}`,
      },
      headers: {
        'Accept-Language': locale,
      },
    });

    expect(signupRes.statusCode).toEqual(200);

    // Extract the session cookie from signup response
    const cookies = helpers.extractCookies(signupRes);
    return cookies;
  }

  /**
   * Helper to get categories for a specific user session.
   */
  async function getCategoriesForSession({ cookies }: { cookies: string }): Promise<CategoryModel[]> {
    // Temporarily swap cookies
    const originalCookies = global.APP_AUTH_COOKIES;
    global.APP_AUTH_COOKIES = cookies;

    try {
      const result = await helpers.makeRequest<CategoryModel[], true>({
        method: 'get',
        url: '/categories',
        raw: true,
      });
      return result;
    } finally {
      global.APP_AUTH_COOKIES = originalCookies;
    }
  }

  describe('Category creation with English locale', () => {
    it('should create English category names when Accept-Language is en', async () => {
      const testEmail = `en-test-${Date.now()}@test.local`;
      const cookies = await signupWithLocale({ email: testEmail, locale: 'en' });
      const categories = await getCategoriesForSession({ cookies });

      // Get main category names (parentId is null)
      const mainCategoryNames = categories.filter((c) => c.parentId === null).map((c) => c.name);

      // Verify English names
      expect(mainCategoryNames).toContain('Food & Drinks');
      expect(mainCategoryNames).toContain('Shopping');
      expect(mainCategoryNames).toContain('Housing');
      expect(mainCategoryNames).toContain('Other');
      expect(mainCategoryNames).toContain('Income');

      // Verify subcategories are also in English
      const allCategoryNames = categories.map((c) => c.name);
      expect(allCategoryNames).toContain('Groceries');
      expect(allCategoryNames).toContain('Restaurant, fast-food');
    });
  });

  describe('Category creation with Ukrainian locale', () => {
    it('should create Ukrainian category names when Accept-Language is uk', async () => {
      const testEmail = `uk-test-${Date.now()}@test.local`;
      const cookies = await signupWithLocale({ email: testEmail, locale: 'uk' });
      const categories = await getCategoriesForSession({ cookies });

      // Get main category names (parentId is null)
      const mainCategoryNames = categories.filter((c) => c.parentId === null).map((c) => c.name);

      // Verify Ukrainian names
      expect(mainCategoryNames).toContain('Їжа та напої');
      expect(mainCategoryNames).toContain('Покупки');
      expect(mainCategoryNames).toContain('Житло');
      expect(mainCategoryNames).toContain('Інше');
      expect(mainCategoryNames).toContain('Дохід');

      // Verify subcategories are also in Ukrainian
      const allCategoryNames = categories.map((c) => c.name);
      expect(allCategoryNames).toContain('Продукти');
      expect(allCategoryNames).toContain('Ресторан, фаст-фуд');
    });
  });

  describe('Fallback to English for unsupported locales', () => {
    it('should create English category names when Accept-Language is unsupported', async () => {
      const testEmail = `fr-test-${Date.now()}@test.local`;
      // Sign up with French locale (unsupported)
      const cookies = await signupWithLocale({ email: testEmail, locale: 'fr' });
      const categories = await getCategoriesForSession({ cookies });

      // Get main category names (parentId is null)
      const mainCategoryNames = categories.filter((c) => c.parentId === null).map((c) => c.name);

      // Should fallback to English
      expect(mainCategoryNames).toContain('Food & Drinks');
      expect(mainCategoryNames).toContain('Shopping');
      expect(mainCategoryNames).toContain('Other');

      // Should NOT contain Ukrainian
      expect(mainCategoryNames).not.toContain('Їжа та напої');
      expect(mainCategoryNames).not.toContain('Інше');
    });
  });

  describe('Stable `key` field on seeded categories', () => {
    /**
     * Canonical set of keys expected on every fresh user, regardless of locale.
     * Hardcoded here as an independent reference — if the seed structure in
     * `default-categories.ts` changes, this set must be updated explicitly. That
     * coupling is intentional: it forces a test review whenever the canonical key
     * set shifts.
     */
    const EXPECTED_MAIN_KEYS = new Set([
      'food',
      'shopping',
      'housing',
      'transportation',
      'vehicle',
      'life',
      'communication',
      'financial-expenses',
      'investments',
      'income',
      'other',
    ]);

    /** Composite (parentKey, key) — subcategory keys aren't globally unique
     *  (e.g. 'lottery-gambling' appears under both `life` and `income`). */
    const EXPECTED_SUBCATEGORY_KEYS = new Set([
      'food/groceries',
      'food/restaurant',
      'food/bar-cafe',
      'shopping/clothes-shoes',
      'shopping/jewels-accessories',
      'shopping/health-beauty',
      'shopping/kids',
      'shopping/home-garden',
      'shopping/pets-animals',
      'shopping/electronics-accessories',
      'shopping/gifts-joy',
      'shopping/stationery-tools',
      'shopping/free-time',
      'shopping/drugstore-chemist',
      'housing/rent',
      'housing/mortgage',
      'housing/energy-utilities',
      'housing/services',
      'housing/maintenance-repairs',
      'housing/property-insurance',
      'transportation/public-transport',
      'transportation/taxi',
      'transportation/long-distance',
      'transportation/business-trips',
      'vehicle/fuel',
      'vehicle/parking',
      'vehicle/vehicle-maintenance',
      'vehicle/rentals',
      'vehicle/vehicle-insurance',
      'vehicle/leasing',
      'life/health-care-doctor',
      'life/wellness-beauty',
      'life/active-sport-fitness',
      'life/culture-sport-events',
      'life/hobbies',
      'life/education-development',
      'life/books-audio-subscriptions',
      'life/tv-streaming',
      'life/holiday-trips-hotels',
      'life/charity-gifts',
      'life/alcohol-tobacco',
      'life/lottery-gambling',
      'communication/phone-cell-phone',
      'communication/internet',
      'communication/software-apps-games',
      'communication/postal-services',
      'financial-expenses/taxes',
      'financial-expenses/insurances',
      'financial-expenses/loan-interests',
      'financial-expenses/fines',
      'financial-expenses/advisory',
      'financial-expenses/charges-fees',
      'financial-expenses/child-support',
      'investments/realty',
      'investments/vehicles-chattels',
      'investments/financial-investments',
      'investments/savings',
      'investments/collections',
      'income/wage-invoices',
      'income/interests-dividends',
      'income/sale',
      'income/rental-income',
      'income/dues-grants',
      'income/lending-renting',
      'income/checks-coupons',
      'income/lottery-gambling',
      'income/refunds',
      'income/freelance',
      'income/gifts',
    ]);

    const KEBAB_CASE_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

    /**
     * Asserts that the user's seeded categories all carry valid `key` values matching
     * the canonical kebab-case set. Locale-independent — names differ per locale but
     * keys are the same identifier.
     */
    function assertKeysAreCanonicalAndKebab(categories: CategoryModel[]) {
      const main = categories.filter((c) => c.parentId === null);
      const subs = categories.filter((c) => c.parentId !== null);

      for (const cat of categories) {
        expect(cat.key).toBeTruthy();
        expect(cat.key).toMatch(KEBAB_CASE_RE);
      }

      const mainKeysSeen = new Set(main.map((c) => c.key as string));
      expect(mainKeysSeen).toEqual(EXPECTED_MAIN_KEYS);

      const idToKey = new Map<number, string>();
      for (const cat of main) idToKey.set(cat.id, cat.key as string);

      const subKeysSeen = new Set(subs.map((c) => `${idToKey.get(c.parentId as number) ?? '?'}/${c.key}`));
      expect(subKeysSeen).toEqual(EXPECTED_SUBCATEGORY_KEYS);
    }

    /**
     * Catches the case where the i18n rename was incomplete: t() falls back to the
     * raw key path (e.g. "defaultCategories.main.financial-expenses") when a key
     * is missing from the locale file. Every category name should be a real
     * translated string, never the lookup path.
     */
    function assertNoNamesAreI18nPaths(categories: CategoryModel[]) {
      for (const cat of categories) {
        expect(cat.name).toBeTruthy();
        expect(cat.name.startsWith('defaultCategories.')).toBe(false);
      }
    }

    it('stamps canonical kebab-case keys for English signups', async () => {
      const cookies = await signupWithLocale({ email: `key-en-${Date.now()}@test.local`, locale: 'en' });
      const categories = await getCategoriesForSession({ cookies });

      assertKeysAreCanonicalAndKebab(categories);
      assertNoNamesAreI18nPaths(categories);
    });

    it('stamps canonical kebab-case keys for Ukrainian signups', async () => {
      const cookies = await signupWithLocale({ email: `key-uk-${Date.now()}@test.local`, locale: 'uk' });
      const categories = await getCategoriesForSession({ cookies });

      assertKeysAreCanonicalAndKebab(categories);
      assertNoNamesAreI18nPaths(categories);
    });
  });
});
