// src/config/index.js
'use strict';

require('dotenv').config();

const config = {
  app: {
    name: process.env.APP_NAME || 'Fitness Cloud Kitchen',
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT, 10) || 3000,
    url: process.env.APP_URL || 'http://localhost:3000',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
    isDev: process.env.NODE_ENV !== 'production',
  },

  db: {
    url: process.env.DATABASE_URL,
  },

  redis: {
    url: process.env.REDIS_URL || null, // null = use memory fallback
  },

  jwt: {
    // If JWT_SECRET not set, generate a deterministic one from DATABASE_URL
    // so tokens survive restarts but differ between deployments
    secret: process.env.JWT_SECRET ||
      require('crypto').createHash('sha256')
        .update(process.env.DATABASE_URL || 'dev-secret-please-set-jwt-secret')
        .digest('hex'),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  bcrypt: {
    rounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 10,
  },

  rateLimit: {
    auth: {
      windowMs: parseInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS, 10) || 15 * 60 * 1000,
      max: parseInt(process.env.RATE_LIMIT_AUTH_MAX, 10) || 5,
    },
    general: {
      windowMs: parseInt(process.env.RATE_LIMIT_GENERAL_WINDOW_MS, 10) || 60 * 1000,
      max: parseInt(process.env.RATE_LIMIT_GENERAL_MAX, 10) || 100,
    },
  },

  email: {
    host: process.env.EMAIL_HOST || 'smtp.mailtrap.io',
    port: parseInt(process.env.EMAIL_PORT, 10) || 587,
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
    from: process.env.EMAIL_FROM || 'noreply@fitnessapp.com',
  },

  otp: {
    expiresMin: parseInt(process.env.OTP_EXPIRES_MIN, 10) || 10,
  },

  claude: {
    apiKey: process.env.CLAUDE_API_KEY,
  },
};

// Only DATABASE_URL is hard-required — Railway injects it from the Postgres plugin
if (!config.db.url) {
  console.error('FATAL: DATABASE_URL environment variable is not set.');
  console.error('On Railway: Add a PostgreSQL database to your project.');
  process.exit(1);
}

module.exports = config;
