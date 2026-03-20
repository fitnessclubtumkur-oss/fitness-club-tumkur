// src/routes/nutrition.routes.js
'use strict';

const router = require('express').Router();
const { query } = require('express-validator');
const ctrl = require('../controllers/nutrition.controller');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');

router.use(authenticate);

// GET /api/nutrition/daily   — full 18-nutrient breakdown for a date
router.get('/daily',
  [query('date').optional().isISO8601()],
  validate,
  ctrl.getDailyNutrients
);

// GET /api/nutrition/weekly  — 7-day trend data for charts
router.get('/weekly',
  [query('days').optional().isInt({ min: 3, max: 90 })],
  validate,
  ctrl.getWeeklyNutrition
);

// GET /api/nutrition/top-foods — most-eaten foods
router.get('/top-foods',
  [query('days').optional().isInt({ min: 1, max: 365 })],
  validate,
  ctrl.getTopFoods
);

// GET /api/nutrition/history
router.get('/history',
  [
    query('start_date').optional().isISO8601(),
    query('end_date').optional().isISO8601(),
    query('meal_type').optional(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  validate,
  ctrl.getNutritionHistory
);

// GET /api/nutrition/compare?food_a=ID&food_b=ID
router.get('/compare', ctrl.compareFoods);

module.exports = router;
