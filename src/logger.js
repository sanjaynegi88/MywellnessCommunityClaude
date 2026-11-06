const pino = require('pino');
module.exports = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  redact: ['req.headers.authorization', '*.apiKey', '*.token', '*.password', '*.appPassword'],
});
