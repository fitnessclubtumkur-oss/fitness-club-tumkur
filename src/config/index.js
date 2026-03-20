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
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev_secret_change_in_prod_min_64_chars_required',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  bcrypt: {
    rounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 12,
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

// Validate critical config in production
if (config.app.env === 'production') {
  const required = ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET'];
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required env variable: ${key}`);
    }
  }
  if (config.jwt.secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }
}

module.exports = config;
