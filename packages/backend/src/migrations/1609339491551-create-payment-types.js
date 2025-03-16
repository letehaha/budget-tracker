module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('PaymentTypes', {
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
      'PaymentTypes',
      [
        { name: 'Bank transfer' },
        { name: 'Voucher' },
        { name: 'Web payment' },
        { name: 'Cash' },
        { name: 'Mobile payment' },
        { name: 'Credit card' },
        { name: 'Debit card' },
      ],
      {},
    );
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('PaymentTypes');
  },
};
