import { ACCOUNT_CATEGORIES, ACCOUNT_TYPES, VEHICLE_CLASS } from '@bt/shared/types';
import { beforeEach, describe, expect, it } from '@jest/globals';
import Accounts from '@models/accounts.model';
import * as helpers from '@tests/helpers';
import { format, subYears } from 'date-fns';

const changeBaseTo = (newCurrencyCode: string) => helpers.changeBaseCurrencyAndWait({ newCurrencyCode });

const pastDate = ({ yearsAgo }: { yearsAgo: number }) => format(subYears(new Date(), yearsAgo), 'yyyy-MM-dd');

/**
 * A vehicle carries its own currency on the underlying Account (`accountCategory: vehicle`)
 * and, unlike cash/loan system accounts, its balance is a directly-maintained depreciating
 * value with no backing transactions. Changing the base currency must recalculate the
 * vehicle's `ref*` amounts into the new base WITHOUT re-denominating the loan currency and
 * WITHOUT snapping the current value back to the creation-time figure (which would drop
 * accrued depreciation). These tests lock both in.
 */
describe('Change Base Currency — vehicles', () => {
  beforeEach(async () => {
    await helpers.makeRequest({
      method: 'post',
      url: '/user/currencies/base',
      payload: { currencyCode: 'GBP' },
    });
    await helpers.addUserCurrencies({ currencyCodes: ['EUR', 'USD'], raw: true });
  });

  it('keeps a foreign-currency vehicle currency and recalculates its ref value on base change', async () => {
    const vehicle = await helpers.createVehicle({
      name: 'EUR Camry',
      currencyCode: 'EUR',
      make: 'Toyota',
      model: 'Camry',
      year: 2020,
      vehicleClass: VEHICLE_CLASS.sedan,
      purchasePrice: 25_000,
      purchaseDate: pastDate({ yearsAgo: 3 }),
      raw: true,
    });

    const accountBefore = await Accounts.findByPk(vehicle.accountId);
    const currentBefore = accountBefore!.currentBalance.toNumber();
    const refCurrentBefore = accountBefore!.refCurrentBalance.toNumber();

    const status = await changeBaseTo('USD');
    helpers.expectBaseCurrencyChangeCompleted(status);

    const accountAfter = await Accounts.findByPk(vehicle.accountId);
    // Currency untouched; still a vehicle system account.
    expect(accountAfter!.currencyCode).toEqual('EUR');
    expect(accountAfter!.accountCategory).toEqual(ACCOUNT_CATEGORIES.vehicle);
    expect(accountAfter!.type).toEqual(ACCOUNT_TYPES.system);
    // Nominal value preserved, ref value recalculated into the new base.
    expect(accountAfter!.currentBalance.toNumber()).toEqual(currentBefore);
    expect(accountAfter!.refCurrentBalance.toNumber()).not.toEqual(refCurrentBefore);
  });

  it('preserves a depreciated vehicle current value instead of snapping it to the creation-time figure', async () => {
    // A vehicle whose current value was manually overridden well below its creation
    // value — this is the case the transaction-sum derivation used to break, because a
    // vehicle has no transactions, so `refCurrentBalance` would collapse back to
    // `refInitialBalance` (the higher creation value) on a base switch.
    const vehicle = await helpers.createVehicle({
      name: 'EUR SUV',
      currencyCode: 'EUR',
      make: 'Toyota',
      model: 'RAV4',
      year: 2019,
      vehicleClass: VEHICLE_CLASS.sedan,
      purchasePrice: 25_000,
      purchaseDate: pastDate({ yearsAgo: 3 }),
      raw: true,
    });

    // Drive the current value down to 5,000 EUR via the override endpoint.
    await helpers.overrideVehicleValue({ id: vehicle.id, targetValue: 5_000, raw: true });

    const accountBefore = await Accounts.findByPk(vehicle.accountId);
    const currentBefore = accountBefore!.currentBalance.toNumber();
    const initialBefore = accountBefore!.initialBalance.toNumber();
    // Precondition: current value now sits below the frozen creation (initial) value.
    expect(currentBefore).toBeLessThan(initialBefore);
    expect(accountBefore!.refCurrentBalance.toNumber()).toBeLessThan(accountBefore!.refInitialBalance.toNumber());

    const status = await changeBaseTo('USD');
    helpers.expectBaseCurrencyChangeCompleted(status);

    const accountAfter = await Accounts.findByPk(vehicle.accountId);

    // Nominal figures untouched.
    expect(accountAfter!.currencyCode).toEqual('EUR');
    expect(accountAfter!.currentBalance.toNumber()).toEqual(currentBefore);
    expect(accountAfter!.initialBalance.toNumber()).toEqual(initialBefore);

    // The bug: refCurrentBalance must still reflect the DEPRECIATED value, not snap up to
    // the creation-time refInitialBalance. Since currentBalance < initialBalance (both
    // positive, same EUR→USD rate applied), the ref values must stay strictly ordered.
    const refCurrentAfter = accountAfter!.refCurrentBalance.toNumber();
    const refInitialAfter = accountAfter!.refInitialBalance.toNumber();
    expect(refCurrentAfter).not.toEqual(refInitialAfter);
    expect(refCurrentAfter).toBeLessThan(refInitialAfter);
  });
});
