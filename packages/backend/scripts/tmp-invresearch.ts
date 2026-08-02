/* eslint-disable */
import fs from 'node:fs';
import path from 'node:path';

import { decryptMsisam } from '../src/services/import-export/ms-money-import/decrypt-msisam';
import { MS_MONEY_FIXTURES, MS_MONEY_FIXTURES_DIR } from '../src/tests/fixtures/ms-money-fixtures';

async function main() {
  const { default: MDBReader } = await import('mdb-reader');
  const targets = (process.env.FILES || 'sunset_401k.mny,sunset-sample-pwd.mny').split(',');
  const mode = process.env.MODE || 'tables';

  for (const file of targets) {
    const fixture = MS_MONEY_FIXTURES.find((f) => f.file === file)!;
    const buffer = fs.readFileSync(path.join(MS_MONEY_FIXTURES_DIR, file));
    const { buffer: plaintext } = decryptMsisam({ buffer, password: fixture.password });
    const reader = new (MDBReader as any)(plaintext);
    const names: string[] = reader.getTableNames();

    console.log(`\n\n########## ${file} ##########`);

    if (mode === 'tables') {
      console.log(`TOTAL TABLES: ${names.length}`);
      for (const n of names.sort()) {
        let count = -1;
        try {
          count = reader.getTable(n).rowCount;
        } catch (e) {
          count = -1;
        }
        console.log(`${n}\t${count}`);
      }
    }

    if (mode === 'cols') {
      const wanted = (process.env.TABLES || '').split(',').filter(Boolean);
      for (const n of wanted) {
        if (!names.includes(n)) {
          console.log(`\n--- ${n}: ABSENT`);
          continue;
        }
        const t = reader.getTable(n);
        console.log(`\n--- ${n} rows=${t.rowCount}`);
        console.log(
          t
            .getColumns()
            .map((c: any) => `${c.name}:${c.type}`)
            .join(', '),
        );
      }
    }

    if (mode === 'dump') {
      const wanted = (process.env.TABLES || '').split(',').filter(Boolean);
      const limit = Number(process.env.LIMIT || 10);
      for (const n of wanted) {
        if (!names.includes(n)) {
          console.log(`\n--- ${n}: ABSENT`);
          continue;
        }
        const t = reader.getTable(n);
        console.log(`\n--- ${n} rows=${t.rowCount}`);
        const data = t.getData();
        for (const row of data.slice(0, limit)) {
          const compact: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(row)) {
            if (v === null || v === undefined) continue;
            if (typeof v === 'string' && v.length > 60) {
              compact[k] = v.slice(0, 60) + '…';
              continue;
            }
            if (Buffer.isBuffer(v)) {
              compact[k] = `<buf ${v.length}>`;
              continue;
            }
            compact[k] = v instanceof Date ? v.toISOString().slice(0, 10) : v;
          }
          console.log(JSON.stringify(compact));
        }
      }
    }

    if (mode === 'custom') {
      await custom({ reader, names, file });
    }
  }
}

async function custom({ reader, names, file }: { reader: any; names: string[]; file: string }) {
  const get = (n: string): any[] => (names.includes(n) ? reader.getTable(n).getData() : []);
  const script = process.env.SCRIPT || '';
  // eslint-disable-next-line
  const fn = new Function('get', 'names', 'reader', 'file', 'console', script);
  fn(get, names, reader, file, console);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
