// src/config/redis.js
'use strict';

const config = require('./index');
const logger = require('../utils/logger');

let redis = null;

function getRedis() {
  // If no REDIS_URL set, return null — callers fall back to in-memory
  if (!config.redis.url) {
    return null;
  }

  if (!redis) {
    const Redis = require('ioredis');
    redis = new Redis(config.redis.url, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,  // don't block on PING
      lazyConnect: true,
      retryStrategy(times) {
        if (times > 3) {
          logger.warn('Redis unavailable — using memory fallback');
          return null; // stop retrying
        }
        return Math.min(times * 500, 2000);
      },
    });

    redis.on('connect', () => logger.info('✅ Redis connected'));
    redis.on('error',   (err) => logger.warn(`Redis error: ${err.message} — rate limits using memory`));
  }
  return redis;
}

module.exports = getRedis;
