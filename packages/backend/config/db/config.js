require('ts-node/register');
require('tsconfig-paths/register');

// We cannot directly feed `config.ts` to `.sequelizerc` since Sequelize just
// cannot accept it. But we can let `ts-node` pre-compile it like this
module.exports = require('./config.ts');
