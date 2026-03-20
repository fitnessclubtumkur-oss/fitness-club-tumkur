// src/routes/dashboard.routes.js
'use strict';

const router = require('express').Router();
const { body, query } = require('express-validator');
const ctrl = require('../controllers/dashboard.controller');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');

router.use(authenticate);

// GET /api/daily-summary
router.get('/daily-summary',
  [query('date').optional().isISO8601()],
  validate,
  ctrl.getDailySummary
);

// GET /api/weekly-summary
router.get('/weekly-summary', ctrl.getWeeklySummary);

// POST /api/mood
router.post('/mood',
  [
    body('date').optional().isISO8601(),
    body('sleep_hours').optional().isFloat({ min: 0, max: 24 }),
    body('mood_rating').optional().isInt({ min: 1, max: 5 }),
    body('stress_level').optional().isInt({ min: 1, max: 5 }),
    body('energy_level').optional().isInt({ min: 1, max: 5 }),
    body('recovery_state').optional().isInt({ min: 1, max: 5 }),
    body('notes').optional().trim().isLength({ max: 500 }),
  ],
  validate,
  ctrl.logMood
);

// GET /api/mood
router.get('/mood',
  [
    query('start').optional().isISO8601(),
    query('end').optional().isISO8601(),
  ],
  validate,
  ctrl.getMoodHistory
);

// POST /api/water
router.post('/water',
  [
    body('ml').isInt({ min: 50, max: 2000 }).withMessage('ml must be 50-2000'),
    body('date').optional().isISO8601(),
  ],
  validate,
  ctrl.logWater
);

// POST /api/sync
router.post('/sync',
  [
    body('items').isArray({ min: 1 }).withMessage('items must be a non-empty array'),
    body('items.*.method').isIn(['POST', 'PUT', 'DELETE']),
    body('items.*.url').notEmpty(),
  ],
  validate,
  ctrl.syncOffline
);

module.exports = router;
