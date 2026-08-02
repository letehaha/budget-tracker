import { decryptMsisam } from '../src/services/import-export/ms-money-import/decrypt-msisam';
import { MS_MONEY_FIXTURES, readMsMoneyFixture } from '../src/tests/fixtures/ms-money-fixtures';

async function main() {
  const { default: MDBReader } = await import('mdb-reader');

  for (const fx of MS_MONEY_FIXTURES) {
    const { buffer: plaintext } = decryptMsisam({
      buffer: readMsMoneyFixture({ file: fx.file }),
      password: fx.password,
    });
    const reader = new MDBReader(plaintext);
    const names = reader.getTableNames();

    const acct = reader.getTable('ACCT');
    const rows = acct.getData() as Record<string, unknown>[];
    const byType = new Map<unknown, number>();
    for (const r of rows) byType.set(r.at, (byType.get(r.at) ?? 0) + 1);
    console.log(`\n=== ${fx.file} — ${rows.length} accounts; types: ${JSON.stringify([...byType.entries()])}`);

    const loanish = rows.filter((r) => r.at === 4 || r.at === 5 || r.at === 6 || r.at === 7);
    for (const r of loanish) {
      console.log(`   at=${r.at} hacct=${r.hacct} name=${JSON.stringify(r.szFull)}`);
    }

    const loanTables = names.filter((n) => /LOAN|AMORT|PMT|BILL|SCHED|MORT/i.test(n));
    console.log(`   loan-ish tables: ${JSON.stringify(loanTables)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
