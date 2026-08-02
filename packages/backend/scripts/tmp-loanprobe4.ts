import { decryptMsisam } from '../src/services/import-export/ms-money-import/decrypt-msisam';
import { MS_MONEY_FIXTURES, readMsMoneyFixture } from '../src/tests/fixtures/ms-money-fixtures';

async function main() {
  const { default: MDBReader } = await import('mdb-reader');
  const fx = MS_MONEY_FIXTURES.find((f) => f.file === 'sunset-sample-pwd.mny')!;
  const { buffer: plaintext } = decryptMsisam({ buffer: readMsMoneyFixture({ file: fx.file }), password: fx.password });
  const reader = new MDBReader(plaintext);

  const nonNull = (r: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(r).filter(
        ([, v]) =>
          v !== null && v !== undefined && v !== '' && v !== false && v !== -1 && !String(v).startsWith('+010000'),
      ),
    );

  const acct = reader.getTable('ACCT').getData() as Record<string, unknown>[];
  console.log('ALL ACCOUNTS:');
  for (const a of acct)
    console.log(
      ` hacct=${a.hacct} at=${a.at} ast=${a.ast} rel=${a.hacctRel} amtOpen=${a.amtOpen} name=${JSON.stringify(a.szFull)}`,
    );

  const xacct = reader.getTable('XACCT').getData() as Record<string, unknown>[];
  console.log('\nXACCT balances:');
  for (const x of xacct) console.log(` hacct=${x.hacct} amtBalance=${x.amtBalance}`);

  const trn = reader.getTable('TRN').getData() as Record<string, unknown>[];
  console.log(
    '\nTRN columns: ' +
      reader
        .getTable('TRN')
        .getColumns()
        .map((c) => c.name)
        .join(','),
  );

  const loanTrn = trn.filter((t) => t.hacct === 18);
  console.log(`\nTRN rows with hacct=18: ${loanTrn.length}`);
  for (const t of loanTrn.slice(0, 8)) console.log(JSON.stringify(nonNull(t)));

  const linkTrn = trn.filter((t) => t.hacctLink === 18);
  console.log(`\nTRN rows with hacctLink=18: ${linkTrn.length}`);
  for (const t of linkTrn.slice(0, 8)) console.log(JSON.stringify(nonNull(t)));

  const trnById = new Map(trn.map((t) => [t.htrn as number, t]));
  const splits = reader.getTable('TRN_SPLIT').getData() as Record<string, unknown>[];
  console.log(
    '\nTRN_SPLIT columns: ' +
      reader
        .getTable('TRN_SPLIT')
        .getColumns()
        .map((c) => c.name)
        .join(','),
  );

  // For the first few loan-side parent rows, show their split children
  const parentsOfInterest = new Set<number>([
    ...loanTrn.map((t) => t.htrn as number),
    ...linkTrn.map((t) => t.htrn as number),
  ]);
  const relevantSplits = splits.filter(
    (s) => parentsOfInterest.has(s.htrnParent as number) || parentsOfInterest.has(s.htrn as number),
  );
  console.log(`\nsplit rows touching loan trns: ${relevantSplits.length}`);
  for (const s of relevantSplits.slice(0, 20)) {
    const child = trnById.get(s.htrn as number);
    console.log(`  split ${JSON.stringify(s)}\n     child=${child ? JSON.stringify(nonNull(child)) : 'MISSING'}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
