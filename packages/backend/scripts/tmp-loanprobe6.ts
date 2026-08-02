import { decryptMsisam } from '../src/services/import-export/ms-money-import/decrypt-msisam';
import { MS_MONEY_FIXTURES, readMsMoneyFixture } from '../src/tests/fixtures/ms-money-fixtures';

async function main() {
  const { default: MDBReader } = await import('mdb-reader');
  const fx = MS_MONEY_FIXTURES.find((f) => f.file === 'sunset-sample-pwd.mny')!;
  const { buffer: plaintext } = decryptMsisam({ buffer: readMsMoneyFixture({ file: fx.file }), password: fx.password });
  const reader = new MDBReader(plaintext);

  const trn = reader.getTable('TRN').getData() as Record<string, unknown>[];
  const trnById = new Map(trn.map((t) => [t.htrn as number, t]));
  const cat = reader.getTable('CAT').getData() as Record<string, unknown>[];
  const catById = new Map(cat.map((c) => [c.hcat as number, c]));
  const splits = reader.getTable('TRN_SPLIT').getData() as Record<string, unknown>[];
  const parentIds = new Set(splits.map((s) => s.htrnParent as number));
  const childIds = new Set(splits.map((s) => s.htrn as number));
  const xfer = reader.getTable('TRN_XFER').getData() as Record<string, unknown>[];
  const inXfer = new Set<number>();
  for (const x of xfer) {
    inXfer.add(x.htrnFrom as number);
    inXfer.add(x.htrnLink as number);
  }

  const loanTrn = trn.filter((t) => t.hacct === 18);
  let splitParents = 0,
    plainXfer = 0,
    other = 0,
    parentsAlsoInXfer = 0;
  for (const t of loanTrn) {
    const h = t.htrn as number;
    if (parentIds.has(h)) {
      splitParents++;
      if (inXfer.has(h)) parentsAlsoInXfer++;
    } else if (childIds.has(h)) {
      /* child */
    } else if (inXfer.has(h)) plainXfer++;
    else other++;
  }
  console.log(
    `loan rows=${loanTrn.length} splitParents=${splitParents} (of which in TRN_XFER=${parentsAlsoInXfer}) plainXferLegs=${plainXfer} otherStandalone=${other}`,
  );
  console.log('standalone loan rows:');
  for (const t of loanTrn.filter(
    (t) => !parentIds.has(t.htrn as number) && !childIds.has(t.htrn as number) && !inXfer.has(t.htrn as number),
  ))
    console.log(
      `   htrn=${t.htrn} dt=${String(t.dt).slice(0, 15)} amt=${t.amt} memo=${t.mMemo} link=${t.hacctLink} grftt=${t.grftt}`,
    );

  const fmt = (t: Record<string, unknown>) =>
    `htrn=${t.htrn} acct=${t.hacct} link=${t.hacctLink} dt=${new Date(t.dt as Date).toISOString().slice(0, 10)} amt=${t.amt} cat=${t.hcat}(${catById.get(t.hcat as number)?.szFull ?? '-'}) memo=${JSON.stringify(t.mMemo)} szId=${JSON.stringify(t.szId)} pay=${t.lHpay} splitP=${parentIds.has(t.htrn as number)} splitC=${childIds.has(t.htrn as number)} xfer=${inXfer.has(t.htrn as number)}`;

  const around = (iso: string) => {
    const d = new Date(iso).getTime();
    console.log(`\n--- ALL rows on ${iso} in acct 18/42/69 ---`);
    for (const t of trn) {
      if (t.hacct !== 18 && t.hacct !== 42 && t.hacct !== 69) continue;
      if (new Date(t.dt as Date).getTime() !== d) continue;
      console.log('  ' + fmt(t));
    }
  };
  around('1992-01-30');
  around('2008-10-30');
  around('2002-08-30');

  // where do the split parents' xfer counterparts live
  console.log('\n--- one split-parent cluster with its children and its xfer partner ---');
  const someParent = loanTrn.find((t) => parentIds.has(t.htrn as number))!;
  console.log('  parent: ' + fmt(someParent));
  for (const s of splits.filter((s) => s.htrnParent === someParent.htrn))
    console.log(`   child iSplit=${s.iSplit}: ` + fmt(trnById.get(s.htrn as number)!));
  for (const x of xfer.filter((x) => x.htrnFrom === someParent.htrn || x.htrnLink === someParent.htrn))
    console.log(
      `   xfer partner: ` + fmt(trnById.get((x.htrnFrom === someParent.htrn ? x.htrnLink : x.htrnFrom) as number)!),
    );

  // Do any other fixtures carry at=4 or at=6? verify explicitly
  console.log('\n--- account-type census across all fixtures ---');
  for (const f of MS_MONEY_FIXTURES) {
    const { buffer: pt } = decryptMsisam({ buffer: readMsMoneyFixture({ file: f.file }), password: f.password });
    const r = new MDBReader(pt);
    const rows = r.getTable('ACCT').getData() as Record<string, unknown>[];
    const at4 = rows.filter((x) => x.at === 4).length;
    const at6 = rows.filter((x) => x.at === 6).length;
    console.log(`  ${f.file}: at=4(liability)=${at4} at=6(loan)=${at6} total=${rows.length}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
