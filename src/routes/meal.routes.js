// src/routes/meal.routes.js
'use strict';

const router = require('express').Router();
const { body, query, param } = require('express-validator');
const ctrl = require('../controllers/meal.controller');
const { authenticate, optionalAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');

const mealTypes = ['BREAKFAST', 'LUNCH', 'SNACK', 'DINNER', 'PRE_WORKOUT', 'POST_WORKOUT'];
const units     = ['GRAMS', 'ML', 'PIECES', 'TBSP', 'TSP', 'CUPS'];

// ─── PUBLIC: Food search (no auth required, for offline pre-loading) ──────────
router.get('/foods',
  optionalAuth,
  [
    query('q').optional().trim(),
    query('category').optional().trim(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  validate,
  ctrl.searchFoods
);

router.get('/foods/barcode/:barcode', optionalAuth, ctrl.getFoodByBarcode);
router.get('/foods/:id',             optionalAuth, ctrl.getFood);

// ─── All meal logging requires auth ───────────────────────────────────────────
router.use(authenticate);

// POST /api/meals/calculate - preview nutrition without logging
router.post('/calculate',
  [
    body('food_id').notEmpty().withMessage('food_id required'),
    body('quantity_raw').isFloat({ min: 1 }).withMessage('quantity_raw must be positive'),
  ],
  validate,
  ctrl.calculateNutrition
);

// POST /api/meals (log single item)
router.post('/',
  [
    body('food_id').notEmpty().withMessage('food_id required'),
    body('meal_type').isIn(mealTypes).withMessage('Invalid meal_type'),
    body('date').isISO8601().withMessage('date must be YYYY-MM-DD'),
    body('quantity_raw').isFloat({ min: 0.1, max: 10000 }).withMessage('quantity_raw must be 0.1-10000'),
    body('unit').optional().isIn(units),
  ],
  validate,
  ctrl.logMealItem
);

// POST /api/meals/bulk (log multiple items at once)
router.post('/bulk',
  [
    body('meal_type').isIn(mealTypes).withMessage('Invalid meal_type'),
    body('date').isISO8601().withMessage('date must be YYYY-MM-DD'),
    body('items').isArray({ min: 1 }).withMessage('items must be a non-empty array'),
    body('items.*.food_id').notEmpty().withMessage('food_id required for each item'),
    body('items.*.quantity_raw').isFloat({ min: 0.1 }).withMessage('quantity_raw must be positive'),
  ],
  validate,
  ctrl.logMealItems
);

// GET /api/meals
router.get('/',
  [
    query('date').optional().isISO8601(),
    query('meal_type').optional().isIn(mealTypes),
  ],
  validate,
  ctrl.getMealItems
);

// PUT /api/meals/:id
router.put('/:id',
  [
    body('quantity_raw').isFloat({ min: 0.1, max: 10000 }).withMessage('quantity_raw must be positive'),
  ],
  validate,
  ctrl.updateMealItem
);

// DELETE /api/meals/:id
router.delete('/:id', ctrl.deleteMealItem);

// POST /api/meals/voice
router.post('/voice',
  [
    body('transcript').notEmpty().withMessage('transcript required'),
    body('parsed_foods').isArray().withMessage('parsed_foods must be an array'),
  ],
  validate,
  ctrl.logVoice
);

module.exports = router;
