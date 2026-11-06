const path = require('path');
const fs = require('fs');
const config = require('./src/config');

function connection() {
  if (config.db.client === 'pg') return config.db.connection;
  const file = config.db.connection === ':memory:' ? ':memory:' : path.resolve(__dirname, config.db.connection);
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  return { filename: file };
}

module.exports = {
  client: config.db.client,
  connection: connection(),
  useNullAsDefault: true,
  pool: config.db.client === 'pg' ? { min: 1, max: 10 } : { min: 1, max: 1 },
  migrations: { directory: path.join(__dirname, 'migrations') },
};
