// src/routes/programs.routes.js
// Phase 3A — Specialist Programs + Blood Sugar + Cycle Tracking + Multi-city
'use strict';

const router = require('express').Router();
const { body, query, param } = require('express-validator');
const ctrl     = require('../controllers/programs.controller');
const { authenticate, optionalAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');

// ── PUBLIC ────────────────────────────────────────────────────────────────────

// Multi-city kitchen discovery
router.get('/kitchens/city/:city', optionalAuth, ctrl.getKitchensByCity);

// List specialist programs
router.get('/programs', optionalAuth,
  [query('type').optional().isIn(['DIABETES','PCOS','PREGNANCY','WEIGHT_LOSS_INTENSIVE','THYROID','HEART_HEALTH'])],
  validate,
  ctrl.listPrograms,
);

router.get('/programs/:id', optionalAuth, ctrl.getProgram);

// ── AUTH REQUIRED ─────────────────────────────────────────────────────────────
router.use(authenticate);

// ── PROGRAM ENROLLMENT ───────────────────────────────────────────────────────
router.post('/programs/enroll',
  [body('program_id').notEmpty().withMessage('program_id required')],
  validate,
  ctrl.enrollProgram,
);

router.get('/programs/my/enrollments', ctrl.myEnrollments);

router.post('/programs/enrollments/:id/advance',
  [param('id').notEmpty()],
  validate,
  ctrl.advanceWeek,
);

router.patch('/programs/enrollments/:id/status',
  [
    param('id').notEmpty(),
    body('action').isIn(['pause','resume','drop']).withMessage('action must be pause, resume, or drop'),
  ],
  validate,
  ctrl.updateEnrollmentStatus,
);

// ── BLOOD SUGAR ───────────────────────────────────────────────────────────────
router.post('/blood-sugar',
  [
    body('reading').isFloat({ min: 0.5, max: 35 }).withMessage('reading must be 0.5–35 mmol/L (or 9–630 mg/dL)'),
    body('unit').optional().isIn(['mmol', 'mgdl']).withMessage('unit must be mmol or mgdl'),
    body('log_type').isIn(['FASTING','PRE_MEAL','POST_MEAL_1H','POST_MEAL_2H','BEDTIME','RANDOM'])
      .withMessage('Invalid log_type'),
    body('meal_ref').optional().trim().isLength({ max: 200 }),
    body('notes').optional().trim().isLength({ max: 500 }),
    body('logged_at').optional().isISO8601(),
  ],
  validate,
  ctrl.logBloodSugar,
);

router.get('/blood-sugar',
  [
    query('start').optional().isISO8601(),
    query('end').optional().isISO8601(),
    query('log_type').optional().isIn(['FASTING','PRE_MEAL','POST_MEAL_1H','POST_MEAL_2H','BEDTIME','RANDOM']),
    query('page').optional().isInt({ min: 1 }),
  ],
  validate,
  ctrl.getBloodSugarLogs,
);

// ── CYCLE TRACKING ────────────────────────────────────────────────────────────
router.post('/cycle',
  [
    body('period_start').isISO8601().withMessage('period_start (ISO date) required'),
    body('period_end').optional().isISO8601(),
    body('cycle_length').optional().isInt({ min: 15, max: 60 }),
    body('period_length').optional().isInt({ min: 1, max: 15 }),
    body('flow_intensity').optional().isIn(['SPOTTING','LIGHT','MEDIUM','HEAVY']),
    body('symptoms').optional(),
    body('mood').optional().trim().isLength({ max: 100 }),
    body('notes').optional().trim().isLength({ max: 500 }),
  ],
  validate,
  ctrl.logPeriod,
);

router.get('/cycle',
  [query('months').optional().isInt({ min: 1, max: 24 })],
  validate,
  ctrl.getCycleHistory,
);

router.patch('/cycle/:id',
  [param('id').notEmpty()],
  validate,
  ctrl.updateCycleEntry,
);

// ── DELIVERY ROUTE OPTIMISATION (staff/admin) ─────────────────────────────────
router.get('/kitchens/:kitchen_id/delivery-route',
  [param('kitchen_id').notEmpty()],
  validate,
  ctrl.getOptimisedRoute,
);

module.exports = router;
