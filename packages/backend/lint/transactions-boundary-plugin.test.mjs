import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runRule } from './plugin-harness.mjs';
import plugin from './transactions-boundary-plugin.mjs';

const boundaryRule = plugin.rules['no-direct-transactions-queries'];
const rawSqlRule = plugin.rules['raw-sql-transactions'];

const expectReports = ({ rule, code, count, filename }) => {
  const reports = runRule({ rule, code, filename });

  assert.equal(reports.length, count, `expected ${count} report(s), got ${reports.length}: ${JSON.stringify(reports)}`);

  return reports;
};

describe('boundary/no-direct-transactions-queries', () => {
  it('flags finders on a namespace import via the default member', () => {
    const reports = expectReports({
      rule: boundaryRule,
      count: 1,
      code: `
        import * as Transactions from '@models/transactions.model';
        export const load = () => Transactions.default.findAll({ where: {} });
      `,
    });

    assert.match(reports[0].message, /transactions-query/);
  });

  it('flags finders on a default import', () => {
    expectReports({
      rule: boundaryRule,
      count: 1,
      code: `
        import Transactions from '@models/transactions.model';
        export const load = () => Transactions.findOne({ where: {} });
      `,
    });
  });

  it('flags an aliased default import', () => {
    expectReports({
      rule: boundaryRule,
      count: 1,
      code: `
        import TxModel from '@models/transactions.model';
        export const wipe = () => TxModel.destroy({ where: {} });
      `,
    });
  });

  it('flags both bindings of a mixed default + namespace import', () => {
    expectReports({
      rule: boundaryRule,
      count: 2,
      code: `
        import TransactionsModel, * as Transactions from '@models/transactions.model';
        export const load = () => TransactionsModel.findAll({});
        export const bump = () => Transactions.default.update({}, { where: {} });
      `,
    });
  });

  it('flags every write and aggregate method', () => {
    expectReports({
      rule: boundaryRule,
      count: 6,
      code: `
        import Transactions from '@models/transactions.model';
        export const all = () => [
          Transactions.findAndCountAll({}),
          Transactions.count({}),
          Transactions.sum('amount'),
          Transactions.min('id'),
          Transactions.max('id'),
          Transactions.aggregate('amount', 'sum'),
        ];
      `,
    });
  });

  it('flags relative imports of the model', () => {
    expectReports({
      rule: boundaryRule,
      count: 1,
      code: `
        import Transactions from './transactions.model';
        export const load = () => Transactions.findAll({});
      `,
    });
  });

  it('ignores identically named models from other modules', () => {
    expectReports({
      rule: boundaryRule,
      count: 0,
      code: `
        import Transactions from './budget-transactions.model';
        export const load = () => Transactions.findAll({});
      `,
    });
  });

  it('ignores an identifier that was never imported from the model', () => {
    expectReports({
      rule: boundaryRule,
      count: 0,
      code: `
        const Transactions = { findAll: () => [] };
        export const load = () => Transactions.findAll({});
      `,
    });
  });

  it('ignores type-only imports', () => {
    expectReports({
      rule: boundaryRule,
      count: 0,
      code: `
        import type Transactions from '@models/transactions.model';
        export const pick = (rows: Transactions[]) => rows[0];
      `,
    });
  });

  it('ignores named exports of the model module', () => {
    expectReports({
      rule: boundaryRule,
      count: 0,
      code: `
        import * as Transactions from '@models/transactions.model';
        export const load = () => Transactions.getTransactionById({ id: 1 });
      `,
    });
  });

  it('ignores non-query methods on the model', () => {
    expectReports({
      rule: boundaryRule,
      count: 0,
      code: `
        import Transactions from '@models/transactions.model';
        export const make = () => Transactions.create({});
      `,
    });
  });
});

describe('boundary/raw-sql-transactions', () => {
  it('flags a SELECT over the table', () => {
    const reports = expectReports({
      rule: rawSqlRule,
      count: 1,
      code: 'export const load = () => sequelize.query(`SELECT id FROM "Transactions" WHERE "userId" = 1`);',
    });

    assert.match(reports[0].message, /real_transactions/);
  });

  it('flags a JOIN over the table', () => {
    expectReports({
      rule: rawSqlRule,
      count: 1,
      code: 'export const load = () => sequelize.query(`SELECT a.id FROM "Accounts" a JOIN "Transactions" t ON t."accountId" = a.id`);',
    });
  });

  it('accepts an inline planned-ok annotation', () => {
    expectReports({
      rule: rawSqlRule,
      count: 0,
      code: 'export const load = () => sequelize.query(`-- planned-ok: the planned summary counts plans\nSELECT id FROM "Transactions"`);',
    });
  });

  it('accepts a planned-ok annotation on the preceding line', () => {
    expectReports({
      rule: rawSqlRule,
      count: 0,
      code: [
        'export const load = () =>',
        '  // oxlint-disable-next-line boundary/raw-sql-transactions -- planned-ok: upcoming payments are plans',
        '  sequelize.query(`SELECT id FROM "Transactions"`);',
      ].join('\n'),
    });
  });

  it('ignores queries against the real_transactions view', () => {
    expectReports({
      rule: rawSqlRule,
      count: 0,
      code: 'export const load = () => sequelize.query(`SELECT id FROM real_transactions`);',
    });
  });

  it('ignores a column reference that merely spells the table name', () => {
    expectReports({
      rule: rawSqlRule,
      count: 0,
      code: 'export const load = () => sequelize.query(`SELECT t."Transactions" FROM real_transactions t`);',
    });
  });

  it('ignores calls that are not queries', () => {
    expectReports({
      rule: rawSqlRule,
      count: 0,
      code: 'export const load = () => logger.info(`SELECT id FROM "Transactions"`);',
    });
  });
});
