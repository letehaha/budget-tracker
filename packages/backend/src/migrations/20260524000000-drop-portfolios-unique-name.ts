import type { AbstractQueryInterface } from '@sequelize/core';

/**
 * Drop the (userId, name) unique constraint on Portfolios.
 *
 * Original intent was UX defensiveness — don't let users end up with two
 * "Crypto" portfolios. In practice the constraint collided with soft-delete
 * (deletedAt is nullable but not part of the unique key), so deleting a
 * portfolio and re-creating it with the same name produced an opaque 500.
 *
 * The product call is to drop the constraint entirely. If we ever want this
 * back, a code-level check (excluding soft-deleted rows) is enough — DB-level
 * uniqueness adds more friction than safety here.
 */
module.exports = {
  up: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    await queryInterface.removeConstraint('Portfolios', 'portfolios_user_name_unique');
  },

  down: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    await queryInterface.addConstraint('Portfolios', {
      fields: ['userId', 'name'],
      type: 'unique',
      name: 'portfolios_user_name_unique',
    });
  },
};
