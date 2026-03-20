// src/middleware/auth.js
'use strict';

const { verifyToken, hashToken } = require('../utils/jwt');
const prisma = require('../config/db');
const { unauthorized, serverError } = require('../utils/response');
const logger = require('../utils/logger');

/**
 * Authenticate requests via Bearer JWT
 * Attaches req.user = { id, email }
 */
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return unauthorized(res, 'Authentication required');
    }

    const token = header.slice(7);
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch {
      return unauthorized(res, 'Invalid or expired token');
    }

    // Check session still valid in DB
    const tokenHash = hashToken(token);
    const session = await prisma.session.findUnique({
      where: { token_hash: tokenHash },
      include: { user: { select: { id: true, email: true, name: true, is_active: true } } },
    });

    if (!session || session.expires_at < new Date()) {
      return unauthorized(res, 'Session expired. Please log in again.');
    }

    if (!session.user.is_active) {
      return unauthorized(res, 'Account deactivated');
    }

    req.user = session.user;
    req.token = token;
    next();
  } catch (err) {
    logger.error({ err }, 'Auth middleware error');
    return serverError(res);
  }
}

/**
 * Optional auth - doesn't fail if no token, just attaches user if present
 */
async function optionalAuth(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) return next();
    const token = header.slice(7);
    try {
      verifyToken(token);
      const session = await prisma.session.findUnique({
        where: { token_hash: hashToken(token) },
        include: { user: { select: { id: true, email: true, name: true } } },
      });
      if (session && session.expires_at > new Date()) req.user = session.user;
    } catch { /* ignore */ }
    next();
  } catch { next(); }
}

module.exports = { authenticate, optionalAuth };
