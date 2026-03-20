// src/middleware/rateLimit.js
'use strict';

const rateLimit = require('express-rate-limit');
const config = require('../config');
const logger = require('../utils/logger');

function createLimiter(windowMs, max, message) {
  const options = {
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message },
    // Skip in dev
    skip: () => config.app.isDev,
  };

  // Only add Redis store if Redis is available
  try {
    const getRedis = require('../config/redis');
    const client = getRedis();
    if (client) {
      const { RedisStore } = require('rate-limit-redis');
      options.store = new RedisStore({
        sendCommand: (...args) => client.call(...args),
      });
      logger.info('Rate limiter: using Redis store');
    } else {
      logger.info('Rate limiter: using memory store (no REDIS_URL)');
    }
  } catch (err) {
    logger.warn(`Rate limiter Redis error: ${err.message} — using memory`);
  }

  return rateLimit(options);
}

const authLimiter    = createLimiter(15 * 60 * 1000, 5,   'Too many login attempts. Try again in 15 minutes.');
const generalLimiter = createLimiter(60 * 1000,       100, 'Too many requests. Please slow down.');
const otpLimiter     = createLimiter(60 * 60 * 1000,  3,   'Too many OTP requests. Try again in 1 hour.');

module.exports = { authLimiter, generalLimiter, otpLimiter };
