import { ROUTES_NAMES } from '@/routes/constants';
import { SHARE_PERMISSIONS } from '@bt/shared/types';
import { createTestingPinia } from '@pinia/testing';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { createRouter, createWebHistory } from 'vue-router';

import HouseholdInvitationContent from './household-invitation-content.vue';

vi.mock('@/api/share', () => ({
  acceptShareInvitation: vi.fn(),
  declineShareInvitation: vi.fn(),
  backInviteFromShareInvitation: vi.fn(),
}));

vi.mock('@/components/notification-center', () => ({
  useNotificationCenter: () => ({
    addSuccessNotification: vi.fn(),
    addErrorNotification: vi.fn(),
  }),
}));

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/settings/currencies', name: ROUTES_NAMES.settingsCurrencies, component: { template: '<div />' } }],
});

const i18n = createI18n({
  legacy: false,
  locale: 'en',
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
          titleCurrencyMismatch: 'Currency mismatch',
          pendingMessage: 'Access {resource}',
          householdResourceLabel: 'all your accounts',
          unknownResource: 'unknown',
          unknownOwner: 'unknown',
          permissionLabel: 'Permission',
          permissions: { read: 'View', write: 'Edit', manage: 'Manage' },
          expiresLabel: 'Expires',
          decline: 'Decline',
          accept: 'Accept',
          acceptedBody: 'You can open it now.',
          declinedBody: 'No worries.',
          unexpectedError: 'Something went wrong.',
          close: 'Close',
          currencyMismatch: 'Need {currency}',
          updateBaseCurrency: 'Update base currency',
          acceptSuccess: 'ok',
          acceptError: 'err',
          declineSuccess: 'ok',
          declineError: 'err',
          backInvite: {
            permissions: { read: 'View', write: 'Edit' },
            writeScope: { all: 'All', own: 'Own' },
            permissionLabel: 'Their permission',
            writeScopeLabel: 'Scope',
            prompt: 'Share with {owner}?',
            notNow: 'Not now',
            send: 'Send back',
            sentTitle: 'Sent',
            sentBody: 'Sent to {owner}',
            done: 'Done',
            deliveryFailed: 'fail',
            success: 'ok',
            error: 'err',
          },
        },
      },
    },
  },
});

const baseInvitation = {
  id: 'invite-h-1',
  token: 'tok-h-1',
  permission: SHARE_PERMISSIONS.write,
  expiresAt: new Date('2026-12-31T00:00:00Z'),
  owner: { username: 'jay' },
} as const;

const mountComponent = ({ isDemo = false }: { isDemo?: boolean } = {}) =>
  mount(HouseholdInvitationContent, {
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
        DemoRestricted: { template: '<span><slot /></span>' },
        // SelectField is heavy (radix-vue + custom logic) — stub it down for these
        // pending-state smoke tests; the back-invite form rendering is exercised via
        // the option arrays in the component, not via a real interaction here.
        SelectField: { template: '<div data-testid="select-field-stub" />' },
      },
    },
  });

describe('HouseholdInvitationContent — pending state', () => {
  it('renders the pending title with the owner’s handle', () => {
    const wrapper = mountComponent();
    expect(wrapper.text()).toContain('Invitation from jay');
  });

  it('shows the household resource label (not a per-account name)', () => {
    const wrapper = mountComponent();
    // The wrapper-injected copy `householdResourceLabel` differentiates household pending
    // body from per-account pending body — a regression here would flatten the two.
    expect(wrapper.text()).toContain('all your accounts');
  });

  it('renders Accept + Decline buttons', () => {
    const wrapper = mountComponent();
    const buttons = wrapper.findAll('button').map((b) => b.text());
    expect(buttons).toContain('Accept');
    expect(buttons).toContain('Decline');
  });

  it('disables write-action buttons in demo mode', () => {
    const wrapper = mountComponent({ isDemo: true });
    const accept = wrapper.findAll('button').find((b) => b.text() === 'Accept');
    const decline = wrapper.findAll('button').find((b) => b.text() === 'Decline');
    expect(accept!.attributes('disabled')).toBeDefined();
    expect(decline!.attributes('disabled')).toBeDefined();
  });
});
