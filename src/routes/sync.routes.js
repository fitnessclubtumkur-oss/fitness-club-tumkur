// src/routes/sync.routes.js
'use strict';

const router = require('express').Router();
const { body } = require('express-validator');
const syncCtrl = require('../controllers/sync.controller');
const pushCtrl = require('../controllers/push.controller');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');

router.use(authenticate);

// POST /api/sync  — batch offline replay
router.post('/',
  [
    body('items').isArray({ min: 1 }).withMessage('items required'),
    body('items.*.method').isIn(['POST', 'PUT', 'PATCH', 'DELETE']),
    body('items.*.url').notEmpty(),
  ],
  validate,
  syncCtrl.syncOffline
);

// GET /api/sync/status
router.get('/status', syncCtrl.getSyncStatus);

// POST /api/push/subscribe
router.post('/push/subscribe',
  [body('subscription').notEmpty()],
  validate,
  pushCtrl.subscribe
);

// POST /api/push/unsubscribe
router.post('/push/unsubscribe',
  [body('endpoint').notEmpty()],
  validate,
  pushCtrl.unsubscribe
);

// POST /api/push/test
router.post('/push/test', pushCtrl.sendTest);

module.exports = router;
