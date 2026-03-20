// src/utils/logger.js
'use strict';

const pino = require('pino');
const config = require('../config');

const logger = pino({
  level: config.app.isDev ? 'debug' : 'info',
  transport: config.app.isDev
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
    : undefined,
  base: { service: 'fitness-api' },
});

module.exports = logger;
