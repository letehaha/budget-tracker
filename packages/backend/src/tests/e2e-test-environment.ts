import { TestEnvironment } from 'jest-environment-node';

/**
 * Jest skips root `afterAll` hooks in a file with no runnable tests (a whole-file
 * `describe.skip`, a `-t` filter), so its BullMQ workers would outlive the file and
 * steal jobs queued by later files in the same worker process.
 */
export default class E2eTestEnvironment extends TestEnvironment {
  async handleTestEvent(event: { name: string }) {
    if (event.name === 'run_finish') await this.global.closeE2eResources?.();
  }
}
