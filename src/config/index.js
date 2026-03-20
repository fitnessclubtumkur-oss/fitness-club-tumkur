// src/config/index.js — Never crash on missing optional env vars
'use strict';

require('dotenv').config();

// Derive a stable JWT secret from DATABASE_URL if JWT_SECRET not provided
// This is safe: same DB = same secret, secrets survive restarts
function deriveSecret() {
  const base = process.env.DATABASE_URL || process.env.RAILWAY_SERVICE_ID || 'local-dev-default';
  return require('crypto').createHash('sha256').update(base + '-jwt').digest('hex');
}

const config = {
  app: {
    name:        process.env.APP_NAME    || 'FitFuel',
    env:         process.env.NODE_ENV    || 'development',
    port:        parseInt(process.env.PORT, 10) || 3000,
    url:         process.env.APP_URL     || 'http://localhost:3000',
    frontendUrl: process.env.FRONTEND_URL || '*',
    isDev:       process.env.NODE_ENV    !== 'production',
  },
  db:    { url: process.env.DATABASE_URL || null },
  redis: { url: process.env.REDIS_URL    || null },
  jwt: {
    secret:    process.env.JWT_SECRET || deriveSecret(),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  bcrypt:    { rounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 10 },
  rateLimit: {
    auth:    { windowMs: 15 * 60 * 1000, max: parseInt(process.env.RATE_LIMIT_AUTH_MAX, 10) || 5 },
    general: { windowMs: 60 * 1000,      max: parseInt(process.env.RATE_LIMIT_GENERAL_MAX, 10) || 100 },
  },
  email: {
    host: process.env.EMAIL_HOST || 'smtp.mailtrap.io',
    port: parseInt(process.env.EMAIL_PORT, 10) || 587,
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
    from: process.env.EMAIL_FROM || 'noreply@fitfuel.app',
  },
  otp:    { expiresMin: 10 },
  claude: { apiKey: process.env.CLAUDE_API_KEY },
};

// Log warnings for missing vars — but NEVER throw / exit here
if (!config.db.url)    console.warn('[config] ⚠️  DATABASE_URL not set — DB will be unavailable');
if (!config.redis.url) console.warn('[config] ℹ️  REDIS_URL not set — using memory rate limiting');
if (!process.env.JWT_SECRET) console.warn('[config] ℹ️  JWT_SECRET not set — using derived secret (set for production)');

module.exports = config;
