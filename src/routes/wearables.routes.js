// src/routes/wearables.routes.js
'use strict';

const router = require('express').Router();
const { body, query } = require('express-validator');
const ctrl   = require('../controllers/wearables.controller');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');

// OAuth callback — no auth (redirect from device)
router.get('/wearables/callback', ctrl.handleOAuthCallback);

router.use(authenticate);

router.get('/wearables',                          ctrl.getConnectedDevices);
router.get('/wearables/data',                     ctrl.getWearableData);
router.get('/wearables/oauth/:device_type',       ctrl.getOAuthUrl);
router.post('/wearables/connect',
  [
    body('device_type').isIn(['FITBIT','GOOGLE_FIT','GARMIN','APPLE_WATCH','SAMSUNG']),
    body('access_token').notEmpty().withMessage('access_token required'),
  ],
  validate, ctrl.connectDevice
);
router.post('/wearables/sync/:device_type',       ctrl.syncNow);
router.delete('/wearables/:device_type',          ctrl.disconnectDevice);

module.exports = router;
