import { decryptMsisam } from '../src/services/import-export/ms-money-import/decrypt-msisam';
import { MS_MONEY_FIXTURES, readMsMoneyFixture } from '../src/tests/fixtures/ms-money-fixtures';

async function main() {
  const { default: MDBReader } = await import('mdb-reader');
  const fx = MS_MONEY_FIXTURES.find((f) => f.file === 'sunset-sample-pwd.mny')!;
  const { buffer: plaintext } = decryptMsisam({ buffer: readMsMoneyFixture({ file: fx.file }), password: fx.password });
  const reader = new MDBReader(plaintext);
  const names = reader.getTableNames().sort();

  console.log(`TOTAL TABLES: ${names.length}`);
  for (const n of names) {
    let count = -1;
    try {
      count = reader.getTable(n).rowCount;
    } catch {
      /* noop */
    }
    process.stdout.write(`${n}(${count})  `);
  }
  console.log('\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
