import { USER_ROLES } from '@bt/shared/types';
import { ADMIN_USER, DEMO_USER, USER } from '@tests/mocks';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useUserStore } from './user';

// Mock the API module
vi.mock('@/api', () => ({
  loadUserData: vi.fn(),
}));

describe('useUserStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('isDemo computed property', () => {
    it('returns true when user has demo role', () => {
      const store = useUserStore();
      store.user = DEMO_USER;

      expect(store.isDemo).toBe(true);
    });

    it('returns false when user has common role', () => {
      const store = useUserStore();
      store.user = USER;

      expect(store.isDemo).toBe(false);
    });

    it('returns false when user has admin role', () => {
      const store = useUserStore();
      store.user = ADMIN_USER;

      expect(store.isDemo).toBe(false);
    });

    it('returns false when user is null', () => {
      const store = useUserStore();
      store.user = null;

      expect(store.isDemo).toBe(false);
    });
  });

  describe('role computed property', () => {
    it('returns demo role for demo user', () => {
      const store = useUserStore();
      store.user = DEMO_USER;

      expect(store.role).toBe(USER_ROLES.demo);
    });

    it('returns common role for regular user', () => {
      const store = useUserStore();
      store.user = USER;

      expect(store.role).toBe(USER_ROLES.common);
    });

    it('returns admin role for admin user', () => {
      const store = useUserStore();
      store.user = ADMIN_USER;

      expect(store.role).toBe(USER_ROLES.admin);
    });

    it('returns null when user is null', () => {
      const store = useUserStore();
      store.user = null;

      expect(store.role).toBe(null);
    });
  });

  describe('isUserExists computed property', () => {
    it('returns true when user exists', () => {
      const store = useUserStore();
      store.user = USER;

      expect(store.isUserExists).toBe(true);
    });

    it('returns false when user is null', () => {
      const store = useUserStore();
      store.user = null;

      expect(store.isUserExists).toBe(false);
    });
  });
});
