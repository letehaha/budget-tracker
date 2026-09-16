import { DataTypes, QueryInterface } from 'sequelize';

/** Email lives in ba_user (better-auth); the Users copy was a stale duplicate every reader already bypassed. */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.removeColumn('Users', 'email');
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.addColumn('Users', 'email', { type: DataTypes.STRING, allowNull: true, unique: true });
  },
};
