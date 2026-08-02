import { decryptMsisam } from '../src/services/import-export/ms-money-import/decrypt-msisam';
import { MS_MONEY_FIXTURES, readMsMoneyFixture } from '../src/tests/fixtures/ms-money-fixtures';

async function main() {
  const { default: MDBReader } = await import('mdb-reader');
  const fx = MS_MONEY_FIXTURES.find((f) => f.file === 'sunset-sample-pwd.mny')!;
  const { buffer: plaintext } = decryptMsisam({ buffer: readMsMoneyFixture({ file: fx.file }), password: fx.password });
  const reader = new MDBReader(plaintext);

  const dump = (name: string) => {
    const t = reader.getTable(name);
    console.log(`\n##### ${name} rows=${t.rowCount}`);
    console.log(
      'COLS: ' +
        t
          .getColumns()
          .map((c) => `${c.name}:${c.type}`)
          .join(', '),
    );
    return t.getData() as Record<string, unknown>[];
  };

  const acct = dump('ACCT');
  const nonNull = (r: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null && v !== undefined && v !== ''));
  const loan = acct.find((r) => r.hacct === 18)!;
  console.log('\n--- ACCT loan (hacct=18) non-null fields:');
  console.log(JSON.stringify(nonNull(loan), null, 1));
  const bank = acct.find((r) => r.at === 0)!;
  console.log('\n--- ACCT sample banking non-null fields:');
  console.log(JSON.stringify(nonNull(bank), null, 1));

  const xacct = dump('XACCT');
  console.log('\n--- XACCT for hacct 18:');
  console.log(JSON.stringify(xacct.filter((r) => r.hacct === 18).map(nonNull), null, 1));

  const bill = dump('BILL');
  console.log(JSON.stringify(bill.map(nonNull), null, 1));

  const pmt = dump('PMT');
  console.log(JSON.stringify(pmt, null, 1));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
