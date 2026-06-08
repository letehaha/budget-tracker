import ExcelJS from 'exceljs';

import { columnsFor } from '../registry';
import { totalRowCount } from '../transformers/utils';
import type { BuiltFile, ExportTable } from '../types';
import { rowToValues } from './row-encoder';
import type { ExportWriter, ExportWriterInput } from './types';

const XLSX_MAX_SHEET_NAME = 31;

async function writeXlsx({ tables }: { tables: ExportTable[] }): Promise<BuiltFile> {
  const workbook = new ExcelJS.Workbook();
  // Pin timestamps to the epoch so the same input produces the same bytes;
  // SHA-256 round-trip tests assert that.
  workbook.created = new Date(0);
  workbook.modified = new Date(0);

  const sheetNames = new Set<string>();
  for (const table of tables) {
    const columns = columnsFor({ name: table.name });
    const baseName = table.name.length > XLSX_MAX_SHEET_NAME ? table.name.slice(0, XLSX_MAX_SHEET_NAME) : table.name;
    let sheetName = baseName;
    let suffix = 2;
    while (sheetNames.has(sheetName)) {
      const sliceLen = Math.max(0, XLSX_MAX_SHEET_NAME - String(suffix).length - 1);
      sheetName = `${baseName.slice(0, sliceLen)}_${suffix}`;
      suffix += 1;
    }
    sheetNames.add(sheetName);
    const sheet = workbook.addWorksheet(sheetName);

    sheet.addRow(columns.map((c) => c.header));
    const header = sheet.getRow(1);
    header.font = { bold: true };
    header.commit();

    // Money columns get `0.00` so Excel renders two decimals while keeping
    // the cell numeric (sortable, sumable). Per-column to avoid mixed-type
    // bracket-formatting bugs in older Excel.
    columns.forEach((col, index) => {
      if (col.kind === 'money') sheet.getColumn(index + 1).numFmt = '0.00';
    });

    for (const row of table.rows as unknown as Record<string, unknown>[]) {
      sheet.addRow(rowToValues({ columns, row }));
    }
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return {
    filename: 'data-export.xlsx',
    buffer: Buffer.from(arrayBuffer as ArrayBuffer),
    rowCount: totalRowCount({ tables }),
  };
}

export const xlsxWriter: ExportWriter = {
  async write({ tables }: ExportWriterInput) {
    return [await writeXlsx({ tables })];
  },
};
