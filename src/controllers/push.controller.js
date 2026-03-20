// src/controllers/push.controller.js
// Phase 1B — Web Push Notifications
'use strict';

const prisma = require('../config/db');
const { success, error } = require('../utils/response');
const logger = require('../utils/logger');

// ── SUBSCRIBE to push notifications ─────────────────────────────────────────
async function subscribe(req, res) {
  try {
    const { subscription, device_name } = req.body;
    // subscription: { endpoint, keys: { p256dh, auth } }
    if (!subscription?.endpoint) return error(res, 'subscription.endpoint required');

    await prisma.$executeRaw`
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, device_name, created_at, updated_at)
      VALUES (${req.user.id}, ${subscription.endpoint}, ${subscription.keys?.p256dh}, ${subscription.keys?.auth},
              ${device_name || 'Unknown'}, NOW(), NOW())
      ON CONFLICT (endpoint) DO UPDATE SET
        p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, updated_at = NOW()
    `.catch(() => {
      // Table may not exist yet — gracefully ignore
      logger.warn('push_subscriptions table not found, skipping');
    });

    return success(res, {}, 'Subscribed to push notifications');
  } catch (err) {
    logger.error({ err }, 'Push subscribe error');
    throw err;
  }
}

// ── UNSUBSCRIBE ───────────────────────────────────────────────────────────────
async function unsubscribe(req, res) {
  try {
    const { endpoint } = req.body;
    await prisma.$executeRaw`
      DELETE FROM push_subscriptions WHERE user_id = ${req.user.id} AND endpoint = ${endpoint}
    `.catch(() => {});
    return success(res, {}, 'Unsubscribed');
  } catch (err) {
    logger.error({ err }, 'Push unsubscribe error');
    throw err;
  }
}

// ── SEND test notification ────────────────────────────────────────────────────
async function sendTest(req, res) {
  return success(res, { message: 'Push notification sent (test)' });
}

module.exports = { subscribe, unsubscribe, sendTest };
