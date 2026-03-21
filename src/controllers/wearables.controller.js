// src/controllers/wearables.controller.js
// Sprint 3 — Wearable device OAuth connect + data sync
'use strict';

const prisma = require('../config/db');
const config = require('../config');
const { success, created, error, notFound } = require('../utils/response');
const logger = require('../utils/logger');

// ── DEVICE CONFIG ─────────────────────────────────────────────────────────────
const DEVICE_CONFIG = {
  FITBIT: {
    auth_url:    'https://www.fitbit.com/oauth2/authorize',
    token_url:   'https://api.fitbit.com/oauth2/token',
    api_base:    'https://api.fitbit.com/1/user/-',
    scope:       'activity heartrate sleep nutrition profile',
    client_id:   process.env.FITBIT_CLIENT_ID     || '',
    client_secret: process.env.FITBIT_CLIENT_SECRET || '',
  },
  GOOGLE_FIT: {
    auth_url:    'https://accounts.google.com/o/oauth2/v2/auth',
    token_url:   'https://oauth2.googleapis.com/token',
    api_base:    'https://www.googleapis.com/fitness/v1/users/me',
    scope:       'https://www.googleapis.com/auth/fitness.activity.read https://www.googleapis.com/auth/fitness.sleep.read',
    client_id:   process.env.GOOGLE_FIT_CLIENT_ID     || '',
    client_secret: process.env.GOOGLE_FIT_CLIENT_SECRET || '',
  },
  GARMIN: {
    auth_url:    'https://connect.garmin.com/oauthConfirm',
    token_url:   'https://connectapi.garmin.com/oauth-service/oauth/token',
    api_base:    'https://healthapi.garmin.com/wellness-api/rest',
    client_id:   process.env.GARMIN_CLIENT_ID     || '',
    client_secret: process.env.GARMIN_CLIENT_SECRET || '',
  },
};

// ── GET OAUTH URL ─────────────────────────────────────────────────────────────
async function getOAuthUrl(req, res) {
  try {
    const { device_type } = req.params;
    const cfg = DEVICE_CONFIG[device_type];

    if (!cfg) return error(res, `Unsupported device: ${device_type}`);
    if (!cfg.client_id) {
      return error(res, `${device_type} not configured. Add ${device_type}_CLIENT_ID and ${device_type}_CLIENT_SECRET to Railway Variables.`, 503);
    }

    const state    = Buffer.from(JSON.stringify({ user_id: req.user.id, device_type })).toString('base64');
    const redirect = `${config.app.url}/api/wearables/callback`;

    const params = new URLSearchParams({
      response_type: 'code',
      client_id:     cfg.client_id,
      redirect_uri:  redirect,
      scope:         cfg.scope || '',
      state,
    });

    const url = `${cfg.auth_url}?${params.toString()}`;
    return success(res, { oauth_url: url, device_type });
  } catch (err) {
    logger.error({ err }, 'Get OAuth URL error');
    throw err;
  }
}

// ── OAUTH CALLBACK ────────────────────────────────────────────────────────────
async function handleOAuthCallback(req, res) {
  try {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) return error(res, `OAuth error: ${oauthError}`);
    if (!state || !code) return error(res, 'Missing code or state');

    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    } catch {
      return error(res, 'Invalid state parameter');
    }

    const { user_id, device_type } = stateData;
    const cfg = DEVICE_CONFIG[device_type];
    if (!cfg) return error(res, 'Invalid device type');

    // Exchange code for tokens
    const tokenRes = await fetch(cfg.token_url, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${cfg.client_id}:${cfg.client_secret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type:   'authorization_code',
        code,
        redirect_uri: `${config.app.url}/api/wearables/callback`,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      logger.error({ body, device_type }, 'Token exchange failed');
      return error(res, 'Failed to connect device. Please try again.');
    }

    const tokens = await tokenRes.json();

    // Store integration
    await prisma.wearableIntegration.upsert({
      where:  { user_id_device_type: { user_id, device_type } },
      create: {
        user_id,
        device_type,
        access_token:  tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        is_active:     true,
        last_sync:     null,
      },
      update: {
        access_token:  tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        is_active:     true,
      },
    });

    // Trigger initial sync
    await syncDeviceData(user_id, device_type, tokens.access_token);

    // Redirect back to app
    return res.redirect(`${config.app.frontendUrl || '/'}?wearable_connected=${device_type}`);
  } catch (err) {
    logger.error({ err }, 'OAuth callback error');
    return res.redirect(`${config.app.frontendUrl || '/'}?wearable_error=true`);
  }
}

// ── MANUAL CONNECT (for apps that share token directly) ──────────────────────
async function connectDevice(req, res) {
  try {
    const { device_type, access_token, refresh_token } = req.body;
    const userId = req.user.id;

    if (!DEVICE_CONFIG[device_type]) return error(res, `Unsupported device: ${device_type}`);

    const integration = await prisma.wearableIntegration.upsert({
      where:  { user_id_device_type: { user_id: userId, device_type } },
      create: { user_id: userId, device_type, access_token, refresh_token: refresh_token || null, is_active: true },
      update: { access_token, refresh_token: refresh_token || null, is_active: true },
    });

    // Trigger sync
    const synced = await syncDeviceData(userId, device_type, access_token);

    return created(res, { integration: { ...integration, access_token: '***' }, synced }, `${device_type} connected!`);
  } catch (err) {
    logger.error({ err }, 'Connect device error');
    throw err;
  }
}

// ── GET CONNECTED DEVICES ─────────────────────────────────────────────────────
async function getConnectedDevices(req, res) {
  try {
    const integrations = await prisma.wearableIntegration.findMany({
      where:   { user_id: req.user.id },
      select:  { id: true, device_type: true, is_active: true, last_sync: true, created_at: true },
    });

    const devices = integrations.map(i => ({
      ...i,
      configured: !!DEVICE_CONFIG[i.device_type]?.client_id,
      sync_status: i.is_active ? (i.last_sync ? 'synced' : 'pending') : 'disconnected',
    }));

    // Available devices (not yet connected)
    const connected_types  = integrations.map(i => i.device_type);
    const available_to_add = Object.keys(DEVICE_CONFIG).filter(d => !connected_types.includes(d));

    return success(res, { devices, available_to_add });
  } catch (err) {
    logger.error({ err }, 'Get devices error');
    throw err;
  }
}

// ── SYNC DEVICE ───────────────────────────────────────────────────────────────
async function syncNow(req, res) {
  try {
    const { device_type } = req.params;
    const userId = req.user.id;

    const integration = await prisma.wearableIntegration.findUnique({
      where: { user_id_device_type: { user_id: userId, device_type } },
    });
    if (!integration || !integration.is_active) return notFound(res, 'Device not connected');

    const synced = await syncDeviceData(userId, device_type, integration.access_token, integration.refresh_token);

    return success(res, { synced, device_type }, `Synced ${synced.records} records from ${device_type}`);
  } catch (err) {
    logger.error({ err }, 'Sync device error');
    throw err;
  }
}

// ── CORE SYNC LOGIC ───────────────────────────────────────────────────────────
async function syncDeviceData(userId, deviceType, accessToken, refreshToken) {
  const today     = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  let   records   = 0;

  try {
    let data = {};

    if (deviceType === 'FITBIT') {
      data = await fetchFitbitData(accessToken, today, yesterday);
    } else if (deviceType === 'GOOGLE_FIT') {
      data = await fetchGoogleFitData(accessToken, today);
    } else {
      // Generic: return empty data (device not fully integrated)
      data = { steps: null, heart_rate_avg: null, sleep_hours: null, calories_burned: null };
    }

    // Upsert wearable data for today
    if (data.steps || data.heart_rate_avg || data.sleep_hours || data.calories_burned) {
      await prisma.wearableData.upsert({
        where: {
          // No unique constraint in schema — use findFirst + update pattern
          id: (await prisma.wearableData.findFirst({
            where: { user_id: userId, device_type: deviceType, date: new Date(today) },
            select: { id: true },
          }))?.id || 'new',
        },
        create: {
          user_id:        userId,
          device_type:    deviceType,
          date:           new Date(today),
          steps:          data.steps          || null,
          heart_rate_avg: data.heart_rate_avg || null,
          sleep_hours:    data.sleep_hours    || null,
          calories_burned: data.calories_burned || null,
        },
        update: {
          steps:          data.steps          || undefined,
          heart_rate_avg: data.heart_rate_avg || undefined,
          sleep_hours:    data.sleep_hours    || undefined,
          calories_burned: data.calories_burned || undefined,
        },
      }).catch(async () => {
        // Fallback: create if upsert fails
        await prisma.wearableData.create({
          data: {
            user_id: userId, device_type: deviceType, date: new Date(today),
            steps: data.steps || null, heart_rate_avg: data.heart_rate_avg || null,
            sleep_hours: data.sleep_hours || null, calories_burned: data.calories_burned || null,
          },
        }).catch(() => {});
      });
      records++;
    }

    // Update last_sync timestamp
    await prisma.wearableIntegration.updateMany({
      where: { user_id: userId, device_type: deviceType },
      data:  { last_sync: new Date() },
    });

    return { records, data, device_type: deviceType };
  } catch (err) {
    logger.warn({ err, userId, deviceType }, 'Device sync failed');
    return { records: 0, error: err.message };
  }
}

// ── FITBIT API ────────────────────────────────────────────────────────────────
async function fetchFitbitData(token, today, yesterday) {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const base    = DEVICE_CONFIG.FITBIT.api_base;

  const results = await Promise.allSettled([
    fetch(`${base}/activities/date/${today}.json`, { headers }),
    fetch(`${base}/sleep/date/${today}.json`,      { headers }),
    fetch(`${base}/activities/heart/date/${today}/1d.json`, { headers }),
  ]);

  const actData   = results[0].status === 'fulfilled' ? await results[0].value.json() : {};
  const sleepData = results[1].status === 'fulfilled' ? await results[1].value.json() : {};
  const hrData    = results[2].status === 'fulfilled' ? await results[2].value.json() : {};

  return {
    steps:          actData?.summary?.steps || null,
    calories_burned: actData?.summary?.caloriesOut || null,
    sleep_hours:    sleepData?.summary?.totalMinutesAsleep
                    ? +(sleepData.summary.totalMinutesAsleep / 60).toFixed(1) : null,
    heart_rate_avg: hrData?.['activities-heart']?.[0]?.value?.restingHeartRate || null,
    active_minutes: actData?.summary?.veryActiveMinutes || null,
    distance_km:    actData?.summary?.distances?.find(d => d.activity === 'total')?.distance || null,
  };
}

// ── GOOGLE FIT API ────────────────────────────────────────────────────────────
async function fetchGoogleFitData(token, today) {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const base    = DEVICE_CONFIG.GOOGLE_FIT.api_base;

  const startMs = new Date(today).setHours(0,0,0,0);
  const endMs   = new Date(today).setHours(23,59,59,999);

  const body = JSON.stringify({
    aggregateBy: [
      { dataTypeName: 'com.google.step_count.delta' },
      { dataTypeName: 'com.google.calories.expended' },
    ],
    bucketByTime: { durationMillis: 86400000 },
    startTimeMillis: startMs,
    endTimeMillis:   endMs,
  });

  const res = await fetch(`${base}/dataset:aggregate`, { method: 'POST', headers, body });
  if (!res.ok) return {};

  const data = await res.json();
  const bucket = data.bucket?.[0];
  if (!bucket) return {};

  const steps    = bucket.dataset?.find(d => d.dataSourceId?.includes('step'))
                    ?.point?.[0]?.value?.[0]?.intVal || null;
  const calories = bucket.dataset?.find(d => d.dataSourceId?.includes('calorie'))
                    ?.point?.[0]?.value?.[0]?.fpVal || null;

  return { steps, calories_burned: calories ? Math.round(calories) : null };
}

// ── GET WEARABLE DATA ─────────────────────────────────────────────────────────
async function getWearableData(req, res) {
  try {
    const { date } = req.query;
    const userId   = req.user.id;
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    const data = await prisma.wearableData.findMany({
      where: { user_id: userId, date: targetDate },
    });

    // Merge: pick best value per metric across all devices
    const merged = {
      steps:          Math.max(0, ...data.map(d => d.steps          || 0)) || null,
      heart_rate_avg: data.find(d => d.heart_rate_avg)?.heart_rate_avg     || null,
      sleep_hours:    data.find(d => d.sleep_hours)?.sleep_hours            || null,
      calories_burned: Math.max(0, ...data.map(d => d.calories_burned || 0)) || null,
    };

    return success(res, { date: targetDate, raw_data: data, merged });
  } catch (err) {
    logger.error({ err }, 'Get wearable data error');
    throw err;
  }
}

// ── DISCONNECT DEVICE ─────────────────────────────────────────────────────────
async function disconnectDevice(req, res) {
  try {
    const { device_type } = req.params;
    await prisma.wearableIntegration.updateMany({
      where: { user_id: req.user.id, device_type },
      data:  { is_active: false },
    });
    return success(res, {}, `${device_type} disconnected`);
  } catch (err) {
    logger.error({ err }, 'Disconnect device error');
    throw err;
  }
}

module.exports = {
  getOAuthUrl, handleOAuthCallback, connectDevice,
  getConnectedDevices, syncNow, getWearableData, disconnectDevice,
  syncDeviceData,
};
