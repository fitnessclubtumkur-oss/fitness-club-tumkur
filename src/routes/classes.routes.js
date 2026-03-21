// src/routes/classes.routes.js
// Phase 3A — Live + Recorded Workout Classes
'use strict';

const router = require('express').Router();
const { body, query, param } = require('express-validator');
const ctrl     = require('../controllers/classes.controller');
const { authenticate, optionalAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');

// ── PUBLIC ────────────────────────────────────────────────────────────────────
router.get('/classes',
  optionalAuth,
  [
    query('type').optional().isIn(['YOGA','HIIT','STRENGTH','CARDIO','MEDITATION','DANCE','PILATES','ZUMBA','STRETCHING']),
    query('level').optional().isIn(['BEGINNER','INTERMEDIATE','ADVANCED','ALL_LEVELS']),
    query('is_live').optional().isBoolean(),
    query('free').optional().isBoolean(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 50 }),
  ],
  validate,
  ctrl.listClasses,
);

router.get('/classes/live', optionalAuth, ctrl.getLiveSchedule);

router.get('/classes/:id',
  optionalAuth,
  [param('id').notEmpty()],
  validate,
  ctrl.getClass,
);

// ── AUTH REQUIRED ─────────────────────────────────────────────────────────────
router.use(authenticate);

// My classes
router.get('/classes/my/bookings',
  [
    query('status').optional().isIn(['BOOKED','ATTENDED','CANCELLED','NO_SHOW']),
    query('page').optional().isInt({ min: 1 }),
  ],
  validate,
  ctrl.myClasses,
);

// Book a class
router.post('/classes/:id/book',
  [param('id').notEmpty()],
  validate,
  ctrl.bookClass,
);

// Mark complete + auto-log
router.post('/classes/:id/complete',
  [
    param('id').notEmpty(),
    body('date').optional().isISO8601().toDate(),
    body('notes').optional().trim(),
  ],
  validate,
  ctrl.completeClass,
);

// Cancel booking
router.delete('/classes/:id/book',
  [param('id').notEmpty()],
  validate,
  ctrl.cancelBooking,
);

// Rate class
router.post('/classes/:id/rate',
  [
    param('id').notEmpty(),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1–5'),
    body('review').optional().trim().isLength({ max: 500 }),
  ],
  validate,
  ctrl.rateClass,
);

// Admin: create class
router.post('/classes',
  [
    body('title').notEmpty().withMessage('Title required'),
    body('instructor').notEmpty().withMessage('Instructor required'),
    body('class_type').isIn(['YOGA','HIIT','STRENGTH','CARDIO','MEDITATION','DANCE','PILATES','ZUMBA','STRETCHING']),
    body('duration_min').isInt({ min: 5, max: 180 }).withMessage('Duration must be 5–180 min'),
    body('level').optional().isIn(['BEGINNER','INTERMEDIATE','ADVANCED','ALL_LEVELS']),
    body('scheduled_at').optional().isISO8601(),
    body('max_participants').optional().isInt({ min: 1 }),
    body('is_live').optional().isBoolean(),
    body('price_inr').optional().isFloat({ min: 0 }),
  ],
  validate,
  ctrl.createClass,
);

module.exports = router;
