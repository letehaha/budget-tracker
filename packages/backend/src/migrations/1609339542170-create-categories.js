module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Categories', {
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
      imageUrl: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      color: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      type: {
        type: Sequelize.ENUM(['custom', 'internal']),
        allowNull: false,
        defaultValue: 'custom',
      },
      parentId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
    });

    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.addColumn(
        'Categories',
        'userId',
        {
          type: Sequelize.INTEGER,
          references: {
            model: 'Users', // name of Target model
            key: 'id', // key in Target model that we're referencing
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        { transaction },
      );
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('Categories');

    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.removeColumn('Categories', 'userId', {
        transaction,
      });
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
};
