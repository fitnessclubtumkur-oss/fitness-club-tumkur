// src/routes/workout.routes.js
'use strict';

const router = require('express').Router();
const { body, query } = require('express-validator');
const ctrl = require('../controllers/workout.controller');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');

router.use(authenticate);

const dateRule       = body('date').isISO8601().withMessage('date must be YYYY-MM-DD');
const intensityRule  = body('intensity').optional().isIn(['LOW', 'MODERATE', 'HIGH', 'VERY_HIGH']);
const durationRule   = body('duration_min').isInt({ min: 1, max: 600 }).withMessage('duration_min must be 1-600');

// ─── POST /api/workouts/cardio ───────────────────────────────────────────────
router.post('/cardio', [dateRule, durationRule, intensityRule], validate, ctrl.logCardio);

// ─── POST /api/workouts/resistance ──────────────────────────────────────────
router.post('/resistance',
  [
    dateRule,
    body('exercises').isArray({ min: 1 }).withMessage('exercises must be a non-empty array'),
    body('exercises.*.exercise').notEmpty().withMessage('exercise name required'),
    body('exercises.*.sets').isArray({ min: 1 }).withMessage('sets required'),
  ],
  validate,
  ctrl.logResistance
);

// ─── POST /api/workouts/yoga ──────────────────────────────────────────────────
router.post('/yoga',
  [
    dateRule,
    durationRule,
    body('yoga_type').optional().isIn(['HATHA', 'VINYASA', 'ASHTANGA', 'BIKRAM', 'POWER', 'RESTORATIVE']),
  ],
  validate,
  ctrl.logYoga
);

// ─── POST /api/workouts/aerobics ──────────────────────────────────────────────
router.post('/aerobics', [dateRule, durationRule, intensityRule], validate, ctrl.logAerobics);

// ─── POST /api/workouts/running ───────────────────────────────────────────────
router.post('/running',
  [
    dateRule,
    body('distance_km').optional().isFloat({ min: 0.1, max: 500 }),
    body('duration_min').optional().isInt({ min: 1, max: 600 }),
    body('route_name').optional().trim(),
  ],
  validate,
  ctrl.logRunning
);

// ─── POST /api/workouts/trekking ──────────────────────────────────────────────
router.post('/trekking',
  [
    dateRule,
    body('distance_km').optional().isFloat({ min: 0.1 }),
    durationRule,
    body('elevation_m').optional().isFloat({ min: 0, max: 9000 }),
    body('trail_name').optional().trim(),
  ],
  validate,
  ctrl.logTrekking
);

// ─── GET /api/workouts ────────────────────────────────────────────────────────
router.get('/',
  [
    query('date').optional().isISO8601(),
    query('start_date').optional().isISO8601(),
    query('end_date').optional().isISO8601(),
    query('type').optional().isIn(['CARDIO', 'RESISTANCE', 'YOGA', 'AEROBICS', 'RUNNING', 'TREKKING']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  validate,
  ctrl.getWorkouts
);

// ─── GET /api/workouts/stats ──────────────────────────────────────────────────
router.get('/stats', ctrl.getWorkoutStats);

// ─── PUT /api/workouts/:id ────────────────────────────────────────────────────
router.put('/:id', ctrl.updateWorkout);

// ─── DELETE /api/workouts/:id ─────────────────────────────────────────────────
router.delete('/:id', ctrl.deleteWorkout);

module.exports = router;
