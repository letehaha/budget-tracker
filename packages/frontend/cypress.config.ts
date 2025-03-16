import { defineConfig } from 'cypress';
import 'dotenv/config';
import fs from 'fs';

export default defineConfig({
  projectId: 'pzeubs',
  env: {
    baseUrl: process.env.BASE_URL,
    baseApiUrl: process.env.VITE_APP_API_HTTP,
  },
  e2e: {
    baseUrl: process.env.BASE_URL,

    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',

    viewportWidth: 1280,
    viewportHeight: 970,
    screenshotOnRunFailure: true,
    retries: 1,
    video: true,
    requestTimeout: 5000,
    defaultCommandTimeout: 5000,
    setupNodeEvents(on, config) {
      on('after:spec', (spec: Cypress.Spec, results: CypressCommandLine.RunResult) => {
        if (results && results.video) {
          // Do we have failures for any retry attempts?
          const failures = results.tests.some((test) => test.attempts.some((attempt) => attempt.state === 'failed'));
          if (!failures) {
            // delete the video if the spec passed and no tests retried
            fs.unlinkSync(results.video);
          }
        }
      });
    },
  },
});
