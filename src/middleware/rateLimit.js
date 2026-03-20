// src/middleware/rateLimit.js
'use strict';

const rateLimit = require('express-rate-limit');
const config = require('../config');
const logger = require('../utils/logger');

// Try to use Redis store for distributed rate limiting, fall back to memory
function createLimiter(windowMs, max, message) {
  const options = {
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message },
    skip: (req) => req.ip === '127.0.0.1' && config.app.isDev,
  };

  // Try Redis store
  try {
    const getRedis = require('../config/redis');
    const { RedisStore } = require('rate-limit-redis');
    const client = getRedis();
    options.store = new RedisStore({ sendCommand: (...args) => client.call(...args) });
  } catch (err) {
    logger.warn('Redis rate limit store unavailable, using memory store');
  }

  return rateLimit(options);
}

// Auth endpoints: 5 attempts per 15 minutes
const authLimiter = createLimiter(
  config.rateLimit.auth.windowMs,
  config.rateLimit.auth.max,
  'Too many login attempts. Please try again in 15 minutes.'
);

// General API: 100 requests per minute
const generalLimiter = createLimiter(
  config.rateLimit.general.windowMs,
  config.rateLimit.general.max,
  'Too many requests. Please slow down.'
);

// Strict limiter for OTP endpoints: 3 per hour
const otpLimiter = createLimiter(
  60 * 60 * 1000,
  3,
  'Too many OTP requests. Please try again in 1 hour.'
);

module.exports = { authLimiter, generalLimiter, otpLimiter };
