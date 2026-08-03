/**
 * Downloads the Microsoft Money sample databases that the `.mny` parser tests
 * run against. They come from the Sunriise project and are not committed here —
 * they are third-party files of a few megabytes each.
 *
 * Already-downloaded files are left alone, so re-running is cheap.
 *
 * Usage: npm run fixtures:ms-money
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  MS_MONEY_FIXTURES,
  MS_MONEY_FIXTURES_BASE_URL,
  MS_MONEY_FIXTURES_DIR,
} from '../src/tests/fixtures/ms-money-fixtures';

async function fetchMsMoneyFixtures(): Promise<void> {
  fs.mkdirSync(MS_MONEY_FIXTURES_DIR, { recursive: true });
  console.log(`[MS Money fixtures] target: ${MS_MONEY_FIXTURES_DIR}`);

  for (const { file } of MS_MONEY_FIXTURES) {
    const target = path.join(MS_MONEY_FIXTURES_DIR, file);
    if (fs.existsSync(target)) {
      console.log(`[MS Money fixtures] have ${file}`);
      continue;
    }

    const response = await fetch(`${MS_MONEY_FIXTURES_BASE_URL}${file}`);
    if (!response.ok) {
      throw new Error(`Failed to download ${file}: ${response.status} ${response.statusText}`);
    }

    // Written under a temporary name first: an interrupted download must not
    // leave a truncated file behind, because the tests treat "file exists" as
    // "fixture is usable".
    const partial = `${target}.part`;
    fs.writeFileSync(partial, Buffer.from(await response.arrayBuffer()));
    fs.renameSync(partial, target);

    console.log(`[MS Money fixtures] saved ${file} (${Math.round(fs.statSync(target).size / 1024)} KB)`);
  }

  console.log(`[MS Money fixtures] done: ${MS_MONEY_FIXTURES.length} files`);
}

fetchMsMoneyFixtures().catch((error) => {
  console.error('[MS Money fixtures] failed', error);
  process.exit(1);
});
