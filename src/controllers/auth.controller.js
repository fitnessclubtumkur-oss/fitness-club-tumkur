// src/controllers/auth.controller.js
'use strict';

const bcrypt = require('bcryptjs');
const prisma = require('../config/db');
const { signToken, hashToken, generateOTP, hashOTP } = require('../utils/jwt');
const { sendOTP } = require('../utils/email');
const config = require('../config');
const { success, created, error, unauthorized, notFound } = require('../utils/response');
const logger = require('../utils/logger');

// ─── REGISTER ────────────────────────────────────────────────────────────────
async function register(req, res) {
  try {
    const { email, pin, name, phone } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return error(res, 'An account with this email already exists', 409);

    const pin_hash = await bcrypt.hash(pin, config.bcrypt.rounds);

    const user = await prisma.user.create({
      data: { email, pin_hash, name, phone },
      select: { id: true, email: true, name: true, created_at: true },
    });

    // Create initial points record
    await prisma.userPoints.create({ data: { user_id: user.id } });

    // Issue JWT + session
    const token = signToken({ sub: user.id, email: user.email });
    const tokenHash = hashToken(token);
    await prisma.session.create({
      data: {
        user_id: user.id,
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        user_agent: req.headers['user-agent'],
        ip_address: req.ip,
      },
    });

    logger.info({ userId: user.id }, 'New user registered');

    return created(res, { user, token }, 'Account created successfully');
  } catch (err) {
    logger.error({ err }, 'Register error');
    throw err;
  }
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
async function login(req, res) {
  try {
    const { email, pin } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, pin_hash: true, is_active: true },
    });

    if (!user) return unauthorized(res, 'Invalid email or PIN');
    if (!user.is_active) return unauthorized(res, 'Account deactivated');

    const valid = await bcrypt.compare(pin, user.pin_hash);
    if (!valid) return unauthorized(res, 'Invalid email or PIN');

    const token = signToken({ sub: user.id, email: user.email });
    const tokenHash = hashToken(token);

    await prisma.session.create({
      data: {
        user_id: user.id,
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        user_agent: req.headers['user-agent'],
        ip_address: req.ip,
      },
    });

    const { pin_hash, ...userSafe } = user;
    logger.info({ userId: user.id }, 'User logged in');

    return success(res, { user: userSafe, token }, 'Login successful');
  } catch (err) {
    logger.error({ err }, 'Login error');
    throw err;
  }
}

// ─── FORGOT PASSWORD (send OTP) ───────────────────────────────────────────────
async function forgotPassword(req, res) {
  try {
    const { email } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return success(res, {}, 'If this email is registered, you will receive an OTP');
    }

    const otp = generateOTP();
    const otpHash = hashOTP(otp);
    const expiresAt = new Date(Date.now() + config.otp.expiresMin * 60 * 1000);

    // Invalidate existing OTPs
    await prisma.otpToken.updateMany({
      where: { user_id: user.id, used: false },
      data: { used: true },
    });

    await prisma.otpToken.create({
      data: { user_id: user.id, otp_hash: otpHash, expires_at: expiresAt },
    });

    await sendOTP(email, otp, user.name);

    return success(res, {}, 'OTP sent to your email');
  } catch (err) {
    logger.error({ err }, 'Forgot password error');
    throw err;
  }
}

// ─── VERIFY OTP & RESET PIN ───────────────────────────────────────────────────
async function resetPin(req, res) {
  try {
    const { email, otp, new_pin } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true },
    });
    if (!user) return error(res, 'Invalid request');

    const otpHash = hashOTP(otp);
    const otpRecord = await prisma.otpToken.findFirst({
      where: {
        user_id: user.id,
        otp_hash: otpHash,
        used: false,
        expires_at: { gt: new Date() },
      },
    });

    if (!otpRecord) return error(res, 'Invalid or expired OTP');

    const pin_hash = await bcrypt.hash(new_pin, config.bcrypt.rounds);

    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { pin_hash } }),
      prisma.otpToken.update({ where: { id: otpRecord.id }, data: { used: true } }),
      // Invalidate all sessions
      prisma.session.deleteMany({ where: { user_id: user.id } }),
    ]);

    logger.info({ userId: user.id }, 'PIN reset');
    return success(res, {}, 'PIN reset successful. Please log in again.');
  } catch (err) {
    logger.error({ err }, 'Reset PIN error');
    throw err;
  }
}

// ─── LOGOUT ──────────────────────────────────────────────────────────────────
async function logout(req, res) {
  try {
    const tokenHash = hashToken(req.token);
    await prisma.session.deleteMany({ where: { token_hash: tokenHash } });
    return success(res, {}, 'Logged out successfully');
  } catch (err) {
    logger.error({ err }, 'Logout error');
    throw err;
  }
}

// ─── LOGOUT ALL DEVICES ───────────────────────────────────────────────────────
async function logoutAll(req, res) {
  try {
    await prisma.session.deleteMany({ where: { user_id: req.user.id } });
    return success(res, {}, 'Logged out from all devices');
  } catch (err) {
    logger.error({ err }, 'Logout all error');
    throw err;
  }
}

// ─── ME (current user) ────────────────────────────────────────────────────────
async function me(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, email: true, name: true, phone: true, avatar_url: true, created_at: true,
        fitness_profile: true,
        user_goals: { where: { is_active: true }, take: 1 },
        points: true,
      },
    });
    return success(res, { user });
  } catch (err) {
    logger.error({ err }, 'Me error');
    throw err;
  }
}

module.exports = { register, login, forgotPassword, resetPin, logout, logoutAll, me };
