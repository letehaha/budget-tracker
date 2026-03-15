module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('AccountTypes', {
      id: {
        type: Sequelize.INTEGER,
        unique: true,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
    });

    await queryInterface.bulkInsert(
      'AccountTypes',
      [
        { name: 'General' },
        { name: 'Cash' },
        { name: 'Current account' },
        { name: 'Credit card' },
        { name: 'Saving account' },
        { name: 'Bonus' },
        { name: 'Insurance' },
        { name: 'Investment' },
        { name: 'Loan' },
        { name: 'Mortgage' },
        { name: 'Account with overdraft' },
      ],
      {},
    );
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('AccountTypes');
  },
};
