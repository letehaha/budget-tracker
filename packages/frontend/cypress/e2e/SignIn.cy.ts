import { TEST_USERS } from '@/cypress/fixtures/users';

describe('SignIn.cy.ts', () => {
  it('should redirect here if user is not authorized', () => {
    cy.visit('/');

    cy.location().should((location) => {
      expect(location.pathname).to.eq('/sign-in');
    });
  });

  it('user should be able to sign in', () => {
    cy.visit('/sign-in');

    cy.get('input[name="username"]').type(TEST_USERS.noData.username);
    cy.get('input[type="password"]').type(TEST_USERS.noData.password);

    cy.get('button[type="submit"]').click();

    cy.location().should((location) => {
      expect(location.pathname).to.eq('/welcome');
    });
  });

  it('user cannot sign in with invalid credentials', () => {
    cy.visit('/sign-in');

    cy.get('input[name="username"]').type('invalid');
    cy.get('input[type="password"]').type('invalid');

    cy.get('button[type="submit"]').click();

    cy.location().should((location) => {
      expect(location.pathname).to.eq('/sign-in');
    });
  });

  it('user should see error message with invalid credentials', () => {
    cy.visit('/sign-in');

    cy.get('input[name="username"]').type('invalid');
    cy.get('input[type="password"]').type('invalid');

    cy.get('button[type="submit"]').click();

    cy.get('.form-wrapper__error').should('be.visible');
  });

  it('should handle Network error', () => {
    cy.intercept(`${Cypress.env('baseApiUrl')}/**/login`, {
      forceNetworkError: true,
    }).as('signIn');

    cy.visit('/sign-in');

    cy.get('input[name="username"]').type(TEST_USERS.noData.username);
    cy.get('input[type="password"]').type(TEST_USERS.noData.password);

    cy.get('button[type="submit"]').click();

    cy.wait('@signIn');

    cy.get('.form-wrapper__error').should('be.visible');
    cy.get('.notifications-center__item--error').should('be.visible');
  });
});
