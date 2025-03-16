module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Accounts', 'internal', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },
  down: async (queryInterface) => {
    queryInterface.removeColumn('Accounts', 'internal');
  },
};
