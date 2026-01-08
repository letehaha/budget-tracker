import { CategoryModel } from '@bt/shared/types';
import { connection } from '@models/index';
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

      // Need to create ba_user record for the auth to work
      const authUserId = `test-user-${Date.now()}`;
      await connection.sequelize.query(
        `INSERT INTO ba_user (id, name, email, "emailVerified", image, "createdAt", "updatedAt")
         VALUES (:id, 'Test User en', :email, true, NULL, NOW(), NOW())`,
        { replacements: { id: authUserId, email: testEmail } },
      );

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

      // Need to create ba_user record for the auth to work
      const authUserId = `test-user-${Date.now()}`;
      await connection.sequelize.query(
        `INSERT INTO ba_user (id, name, email, "emailVerified", image, "createdAt", "updatedAt")
         VALUES (:id, 'Test User uk', :email, true, NULL, NOW(), NOW())`,
        { replacements: { id: authUserId, email: testEmail } },
      );

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

      // Need to create ba_user record for the auth to work
      const authUserId = `test-user-${Date.now()}`;
      await connection.sequelize.query(
        `INSERT INTO ba_user (id, name, email, "emailVerified", image, "createdAt", "updatedAt")
         VALUES (:id, 'Test User fr', :email, true, NULL, NOW(), NOW())`,
        { replacements: { id: authUserId, email: testEmail } },
      );

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
});
