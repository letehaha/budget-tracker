/**
 * Microsoft Money sample databases the `.mny` parser tests run against.
 *
 * The files are not committed: they belong to the Sunriise project and weigh a
 * few megabytes each. `npm run fixtures:ms-money` downloads them into the
 * gitignored directory below, and the tests skip themselves when it is empty,
 * so a fresh checkout stays green without them.
 *
 * Passwords are the ones the sample files were saved with — they are public
 * test data, not credentials.
 */
import type { MsMoneyEncryption } from '@services/import-export/ms-money-import/decrypt-msisam';
import fs from 'node:fs';
import path from 'node:path';

export interface MsMoneyFixture {
  file: string;
  /** Password the file was saved with, or null when it has none. */
  password: string | null;
  /** Which cipher variant the file uses. Asserted by the decrypt tests. */
  encryption: MsMoneyEncryption;
}

export const MS_MONEY_FIXTURES_BASE_URL =
  'https://raw.githubusercontent.com/clmsoft/sunriise/master/src/test/data/mny/';

export const MS_MONEY_FIXTURES_DIR = path.resolve(__dirname, 'ms-money-import');

export const MS_MONEY_FIXTURES: readonly MsMoneyFixture[] = [
  { file: 'money2001-pwd.mny', password: 'TEST12345', encryption: 'legacy-jet' },
  { file: 'money2002.mny', password: null, encryption: 'new-md5' },
  { file: 'money2004-pwd.mny', password: '123@abc!', encryption: 'new-md5' },
  { file: 'money2005-pwd.mny', password: '123@abc!', encryption: 'new-md5' },
  { file: 'money2008-pwd.mny', password: 'Test12345', encryption: 'new-sha1' },
  { file: 'sunset01.mny', password: null, encryption: 'new-sha1' },
  { file: 'sunset02.mny', password: '12345678', encryption: 'new-sha1' },
  { file: 'sunset_401k.mny', password: null, encryption: 'new-sha1' },
  { file: 'sunset-sample-pwd.mny', password: '123@abc!', encryption: 'new-sha1' },
];

export const MS_MONEY_FIXTURES_MISSING_MESSAGE =
  'Microsoft Money fixtures are not downloaded. Run `npm run fixtures:ms-money` in packages/backend to fetch them.';

export const msMoneyFixturesAvailable = (): boolean =>
  MS_MONEY_FIXTURES.every(({ file }) => fs.existsSync(path.join(MS_MONEY_FIXTURES_DIR, file)));

export const readMsMoneyFixture = ({ file }: { file: string }): Buffer =>
  fs.readFileSync(path.join(MS_MONEY_FIXTURES_DIR, file));
