import type { Attributes, Model, ModelStatic, Transaction, WhereOptions } from 'sequelize';

export async function updateOrCreate<T extends Model>(
  model: ModelStatic<T>,
  {
    where,
    transaction,
    returning,
  }: {
    where: WhereOptions<Attributes<T>>;
    transaction?: Transaction;
    returning?: boolean;
  },
  newItem: T['_creationAttributes'],
): Promise<{ item: T; created: boolean }> {
  const foundItem = await model.findOne({ where, transaction });

  if (!foundItem) {
    const item = await model.create(newItem, { transaction, returning });
    return { item, created: true };
  }

  const item = await model.update(newItem, {
    where,
    transaction,
    returning,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { item, created: false } as { item: any; created: boolean };
}
