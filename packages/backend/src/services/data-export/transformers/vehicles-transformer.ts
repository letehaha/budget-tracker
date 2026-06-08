import Accounts from '@models/accounts.model';
import Vehicles from '@models/vehicles.model';
import { Op } from 'sequelize';

import type { VehicleRow } from '../types';
import { resolveRelationName } from './utils';

export async function transformVehicles({ userId }: { userId: number }): Promise<VehicleRow[]> {
  const vehicles = await Vehicles.findAll({ where: { userId }, order: [['createdAt', 'ASC']] });
  if (vehicles.length === 0) return [];

  // Cross-user guard: a stray accountId in a vehicle row must not leak
  // another user's account name into the export.
  const accounts = await Accounts.findAll({
    where: { userId, id: { [Op.in]: vehicles.map((v) => v.accountId) } },
    attributes: ['id', 'name', 'currencyCode'],
  });
  const accountNameById = new Map(accounts.map((a) => [String(a.id), a.name]));
  const accountCurrencyById = new Map(accounts.map((a) => [String(a.id), a.currencyCode]));

  return vehicles.map((vehicle): VehicleRow => {
    const makeModel = [vehicle.make, vehicle.model, vehicle.trim].filter((s) => s && s.length > 0).join(' ');
    const accountIdStr = String(vehicle.accountId);
    // The linked account is the source of both `linkedAccount` and the
    // `currency` column. When the FK can't be resolved (deleted account or
    // a cross-user reference dropped by the userId-scoped query above), both
    // columns must agree: linkedAccount surfaces the sentinel, currency is
    // null so a reader doesn't mistake a blank cell for "no currency set".
    const accountResolved = accountNameById.has(accountIdStr);
    return {
      makeModel,
      year: vehicle.year ?? null,
      linkedAccount: resolveRelationName({
        id: accountIdStr,
        nameById: accountNameById,
        relation: 'account',
        context: `vehicle ${vehicle.id}`,
      }),
      initialCost: vehicle.purchasePrice.toNumber(),
      currency: accountResolved ? (accountCurrencyById.get(accountIdStr) ?? null) : null,
      currentMileage: vehicle.currentMileage ?? null,
      depreciationModel: vehicle.depreciationPreset,
    };
  });
}
