// src/controllers/sync.controller.js
// Phase 1B — Real batch offline sync: replays queued requests server-side
'use strict';

const prisma  = require('../config/db');
const { success } = require('../utils/response');
const logger  = require('../utils/logger');

// Internal route-handler map so we can replay requests without HTTP round-trips
const HANDLERS = {
  'POST /api/workouts/cardio':      () => require('./workout.controller').logCardio,
  'POST /api/workouts/resistance':  () => require('./workout.controller').logResistance,
  'POST /api/workouts/yoga':        () => require('./workout.controller').logYoga,
  'POST /api/workouts/aerobics':    () => require('./workout.controller').logAerobics,
  'POST /api/workouts/running':     () => require('./workout.controller').logRunning,
  'POST /api/workouts/trekking':    () => require('./workout.controller').logTrekking,
  'POST /api/meals':                () => require('./meal.controller').logMealItem,
  'POST /api/meals/bulk':           () => require('./meal.controller').logMealItems,
  'POST /api/mood':                 () => require('./dashboard.controller').logMood,
  'POST /api/water':                () => require('./dashboard.controller').logWater,
};

// Normalise URL to match handler key (strip query strings, trim trailing slash)
function normaliseUrl(url) {
  return url.split('?')[0].replace(/\/$/, '');
}

async function syncOffline(req, res) {
  const { items } = req.body;
  // items: [{ method, url, body, client_timestamp }]
  const userId = req.user.id;
  const results = { synced: 0, skipped: 0, errors: [] };

  for (const item of items) {
    const key = `${item.method.toUpperCase()} ${normaliseUrl(item.url)}`;
    const handlerFn = HANDLERS[key]?.();

    if (!handlerFn) {
      // Unknown endpoint — persist to sync_queue for manual review
      try {
        await prisma.syncQueue.create({
          data: {
            user_id:  userId,
            method:   item.method,
            url:      item.url,
            body:     item.body,
            synced:   false,
            error:    'Unknown endpoint',
          },
        });
      } catch {}
      results.skipped++;
      continue;
    }

    try {
      // Build a fake req / res to replay the handler
      let responseData = null;
      let statusCode   = 200;

      const fakeReq = {
        user:    { id: userId, email: req.user.email, name: req.user.name },
        body:    item.body || {},
        params:  {},
        query:   {},
        headers: req.headers,
        ip:      req.ip,
      };

      const fakeRes = {
        status(code) { statusCode = code; return this; },
        json(data)   { responseData = data; return this; },
      };

      await handlerFn(fakeReq, fakeRes);

      if (statusCode >= 200 && statusCode < 300) {
        results.synced++;
        // Mark as synced in persistent queue if it was stored offline
        await prisma.syncQueue.create({
          data: {
            user_id:   userId,
            method:    item.method,
            url:       item.url,
            body:      item.body,
            synced:    true,
            synced_at: new Date(),
          },
        }).catch(() => {});
      } else {
        results.errors.push({ url: item.url, error: responseData?.message || 'Handler error' });
      }
    } catch (e) {
      logger.warn({ e, url: item.url }, 'Sync item error');
      results.errors.push({ url: item.url, error: e.message });
    }
  }

  logger.info({ userId, ...results }, 'Offline sync completed');
  return success(res, results, `Synced ${results.synced} / ${items.length} items`);
}

// GET /api/sync/status — how many items pending in client's queue
async function getSyncStatus(req, res) {
  try {
    const pending = await prisma.syncQueue.count({
      where: { user_id: req.user.id, synced: false },
    });
    const lastSync = await prisma.syncQueue.findFirst({
      where:   { user_id: req.user.id, synced: true },
      orderBy: { synced_at: 'desc' },
      select:  { synced_at: true },
    });
    return success(res, { pending_count: pending, last_sync_at: lastSync?.synced_at || null });
  } catch (err) {
    logger.error({ err }, 'Get sync status error');
    throw err;
  }
}

module.exports = { syncOffline, getSyncStatus };
