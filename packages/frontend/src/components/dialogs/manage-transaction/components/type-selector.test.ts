import dialogsEn from '@/i18n/locales/chunks/en/dialogs.json';
import { ACCOUNT_TYPES, AccountModel } from '@bt/shared/types';
import { buildSystemExpenseTransaction, buildSystemIncomeTransaction } from '@tests/mocks';
import { getUahAccount } from '@tests/mocks/accounts';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';

import { getFormTypeFromTransaction } from '../helpers';
import TypeSelectorVue from './type-selector.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en: dialogsEn },
});

describe('Record TypeSelector component', () => {
  describe('editing form', () => {
    test.each([
      [
        {
          ...buildSystemExpenseTransaction(),
          accountType: ACCOUNT_TYPES.monobank,
        },
        'Income',
      ],
      [
        {
          ...buildSystemIncomeTransaction(),
          accountType: ACCOUNT_TYPES.monobank,
        },
        'Expense',
      ],
    ])('correct buttons disabled when editing external transaction', (transaction, disabledBtnLabel) => {
      const wrapper = mount(TypeSelectorVue, {
        props: {
          selectedTransactionType: getFormTypeFromTransaction(transaction),
          isFormCreation: false,
          transaction,
          account: getUahAccount({ type: ACCOUNT_TYPES.monobank }) as AccountModel,
        },
        global: {
          plugins: [i18n],
        },
      });

      const buttons = wrapper.findAll('button');

      const desiredButton = buttons.find((item) => item.text().includes(disabledBtnLabel));

      expect(desiredButton!.attributes().disabled !== undefined).toBe(true);

      expect(buttons.filter((item) => item.attributes().disabled !== undefined).length).toBeGreaterThanOrEqual(1);
    });

    test.each([[buildSystemExpenseTransaction()], [buildSystemIncomeTransaction()]])(
      'nothing is disabled when editing system transaction',
      (transaction) => {
        const wrapper = mount(TypeSelectorVue, {
          props: {
            selectedTransactionType: getFormTypeFromTransaction(transaction),
            isFormCreation: false,
            transaction,
            account: getUahAccount() as AccountModel,
          },
          global: {
            plugins: [i18n],
          },
        });

        const buttons = wrapper.findAll('button');
        const disabledButtons = buttons.filter((item) => item.attributes().disabled !== undefined);

        expect(disabledButtons.length).toBe(0);
      },
    );
  });
});
