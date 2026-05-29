import { ROUTES_NAMES } from '@/routes/constants';
import { SHARE_PERMISSIONS } from '@bt/shared/types';
import { createTestingPinia } from '@pinia/testing';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { createRouter, createWebHistory } from 'vue-router';

import ResourceShareInvitationContent from './resource-share-invitation-content.vue';

vi.mock('@/api/share', () => ({
  acceptShareInvitation: vi.fn(),
  declineShareInvitation: vi.fn(),
}));

vi.mock('@/components/notification-center', () => ({
  useNotificationCenter: () => ({
    addSuccessNotification: vi.fn(),
    addErrorNotification: vi.fn(),
  }),
}));

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/account/:id', name: ROUTES_NAMES.account, component: { template: '<div />' } }],
});

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  // Fallback to key-on-missing so the assertions can match interpolation slots.
  missingWarn: false,
  fallbackWarn: false,
  messages: {
    en: {
      dialogs: {
        shareInvitationDialog: {
          titlePending: 'Invitation from {owner}',
          titleAccepted: 'You’re in',
          titleDeclined: 'Declined',
          titleNotFound: 'Not found',
          pendingMessage: 'Access {resource}',
          unknownResource: 'unknown',
          unknownOwner: 'unknown',
          permissionLabel: 'Permission',
          permissions: { read: 'View', write: 'Edit', manage: 'Manage' },
          expiresLabel: 'Expires',
          decline: 'Decline',
          accept: 'Accept',
          acceptedBody: 'You can open it now.',
          goToAccount: 'Go to account',
          declinedBody: 'No worries.',
          unexpectedError: 'Something went wrong.',
          close: 'Close',
          acceptSuccess: 'ok',
          acceptError: 'err',
          declineSuccess: 'ok',
          declineError: 'err',
        },
      },
    },
  },
});

const baseInvitation = {
  id: 'invite-1',
  token: 'tok-1',
  resourceId: 42,
  resourceName: 'Family wallet',
  permission: SHARE_PERMISSIONS.write,
  expiresAt: new Date('2026-12-31T00:00:00Z'),
  owner: { username: 'maria' },
} as const;

const mountComponent = ({ isDemo = false }: { isDemo?: boolean } = {}) =>
  mount(ResourceShareInvitationContent, {
    props: { invitation: { ...baseInvitation } },
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          stubActions: false,
          initialState: {
            user: { user: { id: 1, role: isDemo ? 'demo' : 'common' } },
          },
        }),
        VueQueryPlugin,
        router,
        i18n,
      ],
      stubs: {
        // The DemoRestricted wrapper would attach a tooltip — stub it to a plain span so
        // the inner button stays directly addressable in the DOM.
        DemoRestricted: { template: '<span><slot /></span>' },
      },
    },
  });

describe('ResourceShareInvitationContent — pending state', () => {
  it('renders the pending title with the owner’s handle', () => {
    const wrapper = mountComponent();
    expect(wrapper.text()).toContain('Invitation from maria');
    expect(wrapper.text()).toContain('Family wallet');
  });

  it('renders both Accept and Decline buttons', () => {
    const wrapper = mountComponent();
    const buttons = wrapper.findAll('button').map((b) => b.text());
    expect(buttons).toContain('Accept');
    expect(buttons).toContain('Decline');
  });

  it('disables Accept and Decline buttons when the caller is a demo user', () => {
    const wrapper = mountComponent({ isDemo: true });
    const acceptButton = wrapper.findAll('button').find((b) => b.text() === 'Accept');
    const declineButton = wrapper.findAll('button').find((b) => b.text() === 'Decline');
    expect(acceptButton).toBeDefined();
    expect(declineButton).toBeDefined();
    expect(acceptButton!.attributes('disabled')).toBeDefined();
    expect(declineButton!.attributes('disabled')).toBeDefined();
  });

  it('falls back to the unknown-owner copy when no username is present', () => {
    const wrapper = mount(ResourceShareInvitationContent, {
      props: { invitation: { ...baseInvitation, owner: { username: null } } },
      global: {
        plugins: [createTestingPinia({ createSpy: vi.fn, stubActions: false }), VueQueryPlugin, router, i18n],
        stubs: { DemoRestricted: { template: '<span><slot /></span>' } },
      },
    });
    expect(wrapper.text()).toContain('Invitation from unknown');
  });
});
