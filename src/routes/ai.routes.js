// src/routes/ai.routes.js
'use strict';

const router = require('express').Router();
const { body, query } = require('express-validator');
const ctrl   = require('../controllers/ai.controller');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');

router.use(authenticate);

// Weekly insight
router.post('/insights/generate', ctrl.generateWeeklyInsight);
router.get('/insights',           ctrl.getInsights);

// Photo recognition
router.post('/vision/analyze',
  [body('image_base64').notEmpty().withMessage('image_base64 required')],
  validate,
  ctrl.analyzeMealPhoto
);

// Voice parse (AI-enhanced)
router.post('/voice/parse',
  [body('transcript').notEmpty().withMessage('transcript required')],
  validate,
  ctrl.parseVoiceMeal
);

// Recipes
router.get('/recipes',            ctrl.getMyRecipes);
router.get('/recipes/community',
  [
    query('category').optional(),
    query('search').optional(),
    query('sort').optional().isIn(['rating', 'newest']),
    query('page').optional().isInt({ min: 1 }),
  ],
  validate,
  ctrl.getCommunityRecipes
);
router.post('/recipes',
  [
    body('template_name').notEmpty().withMessage('Recipe name required'),
    body('category').isIn(['BREAKFAST','LUNCH','SNACK','DINNER','PRE_WORKOUT','POST_WORKOUT']),
    body('items').isArray({ min: 1 }).withMessage('At least 1 item required'),
    body('items.*.food_id').notEmpty(),
    body('items.*.quantity_raw').isFloat({ min: 1 }),
  ],
  validate,
  ctrl.saveRecipe
);
router.post('/recipes/:id/log',
  [
    body('meal_type').isIn(['BREAKFAST','LUNCH','SNACK','DINNER','PRE_WORKOUT','POST_WORKOUT']),
    body('date').isISO8601(),
  ],
  validate,
  ctrl.quickLogRecipe
);
router.post('/recipes/:id/rate',
  [body('rating').isInt({ min: 1, max: 5 })],
  validate,
  ctrl.rateRecipe
);

// Mood insights
router.get('/mood/insights', ctrl.getMoodInsights);

module.exports = router;
