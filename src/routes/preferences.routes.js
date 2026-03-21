// src/routes/preferences.routes.js
'use strict';

const router   = require('express').Router();
const { body, query } = require('express-validator');
const ctrl     = require('../controllers/preferences.controller');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');

router.use(authenticate);

// ── Dietary Preferences ───────────────────────────────────────────────────────
router.get('/preferences',                             ctrl.getPreferences);

router.post('/preferences/allergies',
  [body('allergies').isArray().withMessage('allergies must be an array')],
  validate, ctrl.saveAllergies
);
router.post('/preferences/dietary',
  [body('dietary').isArray().withMessage('dietary must be an array')],
  validate, ctrl.saveDietary
);
router.post('/preferences/dislikes',
  [body('dislikes').isArray().withMessage('dislikes must be an array')],
  validate, ctrl.saveDislikes
);

// Customised kitchen menu (filtered by preferences)
router.get('/kitchen-meals/customised', ctrl.getCustomisedMeals);

// ── Weight History ────────────────────────────────────────────────────────────
router.post('/weight',
  [
    body('weight_kg').isFloat({ min: 20, max: 500 }).withMessage('weight_kg must be 20–500'),
    body('date').optional().isISO8601(),
    body('notes').optional().trim().isLength({ max: 200 }),
  ],
  validate, ctrl.logWeight
);
router.get('/weight/history',
  [query('days').optional().isInt({ min: 7, max: 365 })],
  validate, ctrl.getWeightHistory
);

// ── Body Measurements ─────────────────────────────────────────────────────────
router.post('/measurements',
  [
    body('chest_cm').optional().isFloat({ min: 50, max: 200 }),
    body('waist_cm').optional().isFloat({ min: 40, max: 200 }),
    body('hips_cm').optional().isFloat({ min: 50, max: 200 }),
    body('arms_cm').optional().isFloat({ min: 10, max: 100 }),
    body('thighs_cm').optional().isFloat({ min: 20, max: 150 }),
    body('body_fat_pct').optional().isFloat({ min: 3, max: 70 }),
    body('date').optional().isISO8601(),
  ],
  validate, ctrl.logMeasurements
);
router.get('/measurements',
  [query('days').optional().isInt({ min: 7, max: 365 })],
  validate, ctrl.getMeasurements
);

// ── Subscription Management ───────────────────────────────────────────────────
router.get('/subscriptions/:id/details',    ctrl.getSubscriptionDetails);
router.post('/subscriptions/:id/skip',
  [
    body('date').isISO8601().withMessage('date required'),
    body('meal_type').optional(),
  ],
  validate, ctrl.skipDelivery
);
router.patch('/subscriptions/:id/meals-per-day',
  [body('meals_per_day').isInt({ min: 1, max: 5 }).withMessage('meals_per_day must be 1–5')],
  validate, ctrl.changeMealsPerDay
);

// ── Progress Analytics ────────────────────────────────────────────────────────
router.get('/progress',
  [query('period').optional().isIn(['7', '30', '60', '90'])],
  validate, ctrl.getProgressSummary
);

module.exports = router;
