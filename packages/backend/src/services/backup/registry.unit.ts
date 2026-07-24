import { describe, expect, it } from '@jest/globals';

import { BACKUP_EXCLUDED, BACKUP_TABLES, REFERENCE_TABLES } from './registry';

describe('backup registry drift guard', () => {
  it('every registered Sequelize model has an explicit backup decision', async () => {
    // `@models/index` constructs the Sequelize instance at module load. Give it
    // a dialect (and dummy connection params) so construction succeeds — we only
    // read `sequelize.models`, which never touches the database. Set before the
    // dynamic import so the values are in place when the module evaluates.
    process.env.APPLICATION_DB_DIALECT ??= 'postgres';
    process.env.APPLICATION_DB_HOST ??= 'localhost';
    process.env.APPLICATION_DB_PORT ??= '5432';
    process.env.APPLICATION_DB_USERNAME ??= 'postgres';
    process.env.APPLICATION_DB_PASSWORD ??= 'postgres';
    process.env.APPLICATION_DB_DATABASE ??= 'backup_drift_check';

    const { connection } = await import('@models/index');

    // Compare by class reference: registry entries import the same model
    // classes Sequelize registered, so a new model added to the app without a
    // BACKUP_TABLES / REFERENCE_TABLES / BACKUP_EXCLUDED entry shows up here.
    const covered = new Set<unknown>([...BACKUP_TABLES, ...REFERENCE_TABLES, ...BACKUP_EXCLUDED].map((e) => e.model));

    const registered = Object.values(connection.sequelize.models) as { name: string }[];
    const uncovered = registered.filter((model) => !covered.has(model)).map((model) => model.name);

    expect(uncovered).toEqual([]);
  });
});
