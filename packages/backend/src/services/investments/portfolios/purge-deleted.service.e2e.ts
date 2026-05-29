import { PORTFOLIO_TRASH_RETENTION_DAYS } from '@bt/shared/types/investments';
import Portfolios from '@models/investments/portfolios.model';
import { purgeDeletedPortfolios } from '@services/investments/portfolios/purge-deleted.service';
import * as helpers from '@tests/helpers';
import { subDays } from 'date-fns';
import { describe, expect, it } from 'vitest';

describe('Purge Deleted Portfolios Service E2E', () => {
  it('should purge portfolios soft-deleted past the retention window and leave fresh trash + live portfolios alone', async () => {
    const expired = await helpers.createPortfolio({
      payload: helpers.buildPortfolioPayload({ name: 'Expired Trash' }),
      raw: true,
    });
    const fresh = await helpers.createPortfolio({
      payload: helpers.buildPortfolioPayload({ name: 'Fresh Trash' }),
      raw: true,
    });
    const live = await helpers.createPortfolio({
      payload: helpers.buildPortfolioPayload({ name: 'Live Portfolio' }),
      raw: true,
    });

    await helpers.deletePortfolio({ portfolioId: expired.id });
    await helpers.deletePortfolio({ portfolioId: fresh.id });

    // Backdate the trashed timestamp past the retention cutoff.
    const stale = subDays(new Date(), PORTFOLIO_TRASH_RETENTION_DAYS + 1);
    await Portfolios.update({ deletedAt: stale }, { where: { id: expired.id }, paranoid: false });

    const result = await purgeDeletedPortfolios();
    expect(result.purgedCount).toBe(1);
    expect(result.failedCount).toBe(0);

    const expiredRow = await Portfolios.findOne({ where: { id: expired.id }, paranoid: false });
    expect(expiredRow).toBeNull();

    // Recently-trashed portfolio still exists in DB.
    const freshRow = await Portfolios.findOne({ where: { id: fresh.id }, paranoid: false });
    expect(freshRow).not.toBeNull();
    expect(freshRow?.deletedAt).not.toBeNull();

    // Live portfolio (never trashed) must survive the purge.
    const liveRow = await Portfolios.findOne({ where: { id: live.id }, paranoid: false });
    expect(liveRow).not.toBeNull();
    expect(liveRow?.deletedAt).toBeNull();
  });

  it('should be a no-op when nothing is past retention', async () => {
    const result = await purgeDeletedPortfolios();
    expect(result.purgedCount).toBe(0);
    expect(result.failedCount).toBe(0);
  });
});
