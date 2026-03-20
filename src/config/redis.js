// src/config/redis.js
'use strict';

const Redis = require('ioredis');
const config = require('./index');
const logger = require('../utils/logger');

let redis = null;

function getRedis() {
  if (!redis) {
    redis = new Redis(config.redis.url, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
      retryStrategy(times) {
        if (times > 3) {
          logger.warn('Redis connection failed, using memory fallback');
          return null; // stop retrying
        }
        return Math.min(times * 500, 2000);
      },
    });

    redis.on('connect', () => logger.info('Redis connected'));
    redis.on('error', (err) => logger.warn('Redis error:', err.message));
    redis.on('close', () => logger.warn('Redis connection closed'));
  }
  return redis;
}

module.exports = getRedis;
