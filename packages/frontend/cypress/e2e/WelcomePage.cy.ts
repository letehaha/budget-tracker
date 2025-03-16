import { GENERIC_CURRENCY } from '@/cypress/fixtures/currencies';
import { TEST_USERS } from '@/cypress/fixtures/users';

describe('Welcome page', () => {
  // TODO:
  // it.todo('test signup');
  // it.todo('test that after setting base currency with no mock redirect works')

  it("should redirect to welcome page if base currency isn't set", () => {
    cy.signInUser(TEST_USERS.noData);

    cy.location().should((location) => {
      expect(location.pathname).to.eq('/welcome');
    });

    cy.visit('/');

    cy.location().should((location) => {
      expect(location.pathname).to.eq('/welcome');
    });

    cy.visit('/settings');

    cy.location().should((location) => {
      expect(location.pathname).to.eq('/welcome');
    });
  });

  it('should not be accesible if base currency is already set', () => {
    cy.signInUser(TEST_USERS.noDataWithBaseCurrency);

    cy.location().should((location) => {
      expect(location.pathname).to.eq('/dashboard');
    });

    cy.visit('/welcome');

    cy.location().should((location) => {
      expect(location.pathname).to.eq('/dashboard');
    });
  });

  it('should redirect to dashboard once base currency is set', () => {
    cy.intercept('POST', `${Cypress.env('baseApiUrl')}/**/user/currencies/base*`, {
      statusCode: 200,
      body: {
        response: GENERIC_CURRENCY,
        status: 'success',
      },
    });

    cy.signInUser(TEST_USERS.noData);

    cy.location().should((location) => {
      expect(location.pathname).to.eq('/welcome');
    });

    cy.get('.select-field__wrapper').click().get('[role="listbox"]').children().last().click();

    cy.get('button[type="button"]').contains('Confirm Currency').click();

    cy.location().should((location) => {
      expect(location.pathname).to.eq('/dashboard');
    });
  });

  it('should be possible to sign out from welcome page', () => {
    cy.signInUser(TEST_USERS.noData);

    cy.location().should((location) => {
      expect(location.pathname).to.eq('/welcome');
    });

    cy.get('button[type="button"]').contains('Logout').click();

    cy.location().should((location) => {
      expect(location.pathname).to.eq('/sign-in');
    });
  });
});
