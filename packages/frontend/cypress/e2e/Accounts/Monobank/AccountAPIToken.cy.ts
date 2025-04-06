import { TEST_USERS } from '@/cypress/fixtures/users';

function generateRandomString(n: number) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < n; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters[randomIndex];
  }
  return result;
}

describe('Manage Monobank API token', () => {
  it('should pair new account if not paired yet', () => {
    cy.intercept(`${Cypress.env('baseApiUrl')}/**/banks/monobank/pair-user*`, {
      statusCode: 200,
      body: {
        status: 'success',
      },
    });

    cy.signInUser(TEST_USERS.noDataWithBaseCurrency);

    cy.visit('/accounts');

    cy.getNode('pair-monobank-account').click();
    cy.getNode('monobank-set-token-modal').should('be.visible');

    cy.get('input[name=token]').type(generateRandomString(44));

    cy.get('button[type=submit]').click();

    cy.getNode('monobank-set-token-modal').should('not.exist');
    cy.get('.notifications-center__item--success').should('be.visible');
  });

  it('should keep modal open if the request is failed', () => {
    cy.signInUser(TEST_USERS.noDataWithBaseCurrency);

    cy.visit('/accounts');

    cy.getNode('pair-monobank-account').click();
    cy.getNode('monobank-set-token-modal').should('be.visible');

    cy.get('input[name=token]').type('random token');

    cy.get('button[type=submit]').click();

    cy.get('.field-error').should('be.visible');
  });

  it('pair button should not exist if user already paired', () => {
    cy.signInUser(TEST_USERS.fullData);

    cy.visit('/accounts');

    cy.getNode('pair-monobank-account').should('not.exist');
  });
});
