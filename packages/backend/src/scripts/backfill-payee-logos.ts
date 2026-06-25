import '../bootstrap';

import { logger } from '@js/utils/logger';
import Payees from '@models/payees.model';
import { Op } from 'sequelize';

import { connection } from '../models';
import { applyCachedLogos, enqueueLogoResolution, logoResolutionQueue } from '../services/brand-logos';

/**
 * Eager backfill for Payees that predate the brand-logo feature
 * (`logoSource IS NULL`). For each page:
 *   1. `applyCachedLogos` resolves seed/cache hits with zero API calls.
 *   2. The returned cache misses are enqueued for async logo.dev resolution.
 *
 * Paginates by ascending primary key. Because step 1 stamps `logoSource` on the
 * hits, only the misses remain NULL, so we advance the cursor past the last
 * id of each page rather than re-querying from offset 0.
 *
 * Usage: npm run backfill:payee-logos
 */
const PAGE_SIZE = 500;

async function backfillPayeeLogos(): Promise<void> {
  let cursorId: string | null = null;
  let scanned = 0;
  let enqueued = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const page = await Payees.findAll({
      where: {
        logoSource: null,
        // Keyset cursor: stamping `logoSource` on cache hits removes them from
        // this predicate, so advancing past the last id avoids re-scanning them.
        ...(cursorId !== null ? { id: { [Op.gt]: cursorId } } : {}),
      },
      order: [['id', 'ASC']],
      limit: PAGE_SIZE,
    });

    if (page.length === 0) break;

    scanned += page.length;
    cursorId = page[page.length - 1]!.id;

    const misses = await applyCachedLogos<Payees>({ entity: 'payee', rows: page });
    for (const payee of misses) {
      await enqueueLogoResolution({ entity: 'payee', id: payee.id });
    }
    enqueued += misses.length;

    logger.info(
      `[Backfill Payee Logos] page done: scanned=${scanned}, cacheHits=${page.length - misses.length}, enqueued+=${misses.length}`,
    );

    if (page.length < PAGE_SIZE) break;
  }

  logger.info(`[Backfill Payee Logos] complete: scanned=${scanned} payees, enqueued=${enqueued} for async resolution`);
}

backfillPayeeLogos()
  .then(async () => {
    await logoResolutionQueue.close();
    await connection.sequelize.close();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error({ message: '[Backfill Payee Logos] failed', error });
    try {
      await logoResolutionQueue.close();
      await connection.sequelize.close();
    } catch {
      // best-effort cleanup
    }
    process.exit(1);
  });
