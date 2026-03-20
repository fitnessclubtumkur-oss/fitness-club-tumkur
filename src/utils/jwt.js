// src/utils/jwt.js
'use strict';

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');

/**
 * Sign a JWT for a user
 */
function signToken(payload) {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
    issuer: 'fitness-api',
  });
}

/**
 * Verify a JWT and return decoded payload
 */
function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret, { issuer: 'fitness-api' });
}

/**
 * Hash a token for safe DB storage
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a random OTP (6 digits)
 */
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Hash an OTP for DB storage
 */
function hashOTP(otp) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

module.exports = { signToken, verifyToken, hashToken, generateOTP, hashOTP };
