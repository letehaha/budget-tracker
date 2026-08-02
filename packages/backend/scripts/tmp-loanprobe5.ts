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
  const pay = reader.getTable('PAY').getData() as Record<string, unknown>[];
  const payById = new Map(pay.map((p) => [p.hpay as number, p]));

  console.log('CAT 130:', JSON.stringify(catById.get(130)));
  console.log('CAT 213:', JSON.stringify(catById.get(213)));
  console.log('PAY 1:', JSON.stringify(payById.get(1)));

  // CAT top-level roots for context
  console.log(
    '\nCAT level0/1 near 130:',
    cat
      .filter((c) => (c.hcat as number) < 20 || c.hcat === 130 || c.hcat === 213)
      .map((c) => `${c.hcat}:${c.szFull}(lvl${c.nLevel},parent${c.hcatParent})`)
      .join(' | '),
  );

  const xfer = reader.getTable('TRN_XFER').getData() as Record<string, unknown>[];
  console.log(
    '\nTRN_XFER cols: ' +
      reader
        .getTable('TRN_XFER')
        .getColumns()
        .map((c) => c.name)
        .join(','),
  );
  const loanXfer = xfer.filter((x) => {
    const a = trnById.get(x.htrnFrom as number);
    const b = trnById.get(x.htrnLink as number);
    return a?.hacct === 18 || b?.hacct === 18;
  });
  console.log(`TRN_XFER pairs touching hacct=18: ${loanXfer.length}`);
  for (const x of loanXfer.slice(0, 5)) {
    const a = trnById.get(x.htrnFrom as number)!;
    const b = trnById.get(x.htrnLink as number)!;
    console.log(
      `  ${JSON.stringify(x)}\n    from htrn=${a.htrn} acct=${a.hacct} amt=${a.amt} memo=${a.mMemo} hcat=${a.hcat}` +
        `\n    to   htrn=${b.htrn} acct=${b.hacct} amt=${b.amt} memo=${b.mMemo} hcat=${b.hcat}`,
    );
  }

  // Date range of loan register + memo histogram + category histogram
  const loanTrn = trn.filter((t) => t.hacct === 18);
  const dates = loanTrn.map((t) => String(t.dt)).sort();
  console.log(`\nloan register rows=${loanTrn.length} first=${dates[0]} last=${dates[dates.length - 1]}`);
  const memoHist = new Map<string, number>();
  const catHist = new Map<string, number>();
  for (const t of loanTrn) {
    memoHist.set(String(t.mMemo), (memoHist.get(String(t.mMemo)) ?? 0) + 1);
    const key = `${t.hcat}=${catById.get(t.hcat as number)?.szFull ?? '-'}`;
    catHist.set(key, (catHist.get(key) ?? 0) + 1);
  }
  console.log('memo hist:', JSON.stringify([...memoHist.entries()]));
  console.log('cat hist:', JSON.stringify([...catHist.entries()]));

  // Look at one whole late cluster by szId
  const bySzId = new Map<string, Record<string, unknown>[]>();
  for (const t of trn) {
    if (t.hacct !== 18 && t.hacctLink !== 18) continue;
    const k = String(t.szId ?? '(none)');
    if (!bySzId.has(k)) bySzId.set(k, []);
    bySzId.get(k)!.push(t);
  }
  const keys = [...bySzId.keys()].sort();
  console.log('\ndistinct szId groups touching loan:', keys.length);
  for (const k of keys.slice(-6)) {
    console.log(` szId=${JSON.stringify(k)}`);
    for (const t of bySzId.get(k)!)
      console.log(
        `    htrn=${t.htrn} acct=${t.hacct} link=${t.hacctLink} dt=${String(t.dt).slice(0, 10)} amt=${t.amt} hcat=${t.hcat}(${catById.get(t.hcat as number)?.szFull ?? '-'}) memo=${t.mMemo} grftt=${t.grftt}`,
      );
  }
  // group with no szId
  const none = bySzId.get('(none)') ?? [];
  console.log(`\nrows touching loan with no szId: ${none.length}`);
  for (const t of none.slice(0, 15))
    console.log(
      `    htrn=${t.htrn} acct=${t.hacct} link=${t.hacctLink} dt=${String(t.dt).slice(0, 10)} amt=${t.amt} hcat=${t.hcat}(${catById.get(t.hcat as number)?.szFull ?? '-'}) memo=${t.mMemo}`,
    );

  // escrow account transactions
  const escrow = trn.filter((t) => t.hacct === 69 || t.hacctLink === 69);
  console.log(`\nEscrow Account(69) rows: ${escrow.length}`);
  for (const t of escrow.slice(0, 10))
    console.log(
      `    htrn=${t.htrn} acct=${t.hacct} link=${t.hacctLink} dt=${String(t.dt).slice(0, 10)} amt=${t.amt} hcat=${t.hcat}(${catById.get(t.hcat as number)?.szFull ?? '-'}) memo=${t.mMemo}`,
    );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
