// src/routes/profile.routes.js
'use strict';

const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/profile.controller');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');

// All profile routes require auth
router.use(authenticate);

// POST /api/profile  (create or update)
router.post('/',
  [
    body('age').isInt({ min: 10, max: 120 }).withMessage('Age must be 10-120'),
    body('gender').isIn(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']).withMessage('Invalid gender'),
    body('height_cm').isFloat({ min: 50, max: 300 }).withMessage('Height must be 50-300 cm'),
    body('weight_kg').isFloat({ min: 20, max: 500 }).withMessage('Weight must be 20-500 kg'),
    body('activity_level').optional().isIn(['SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'VERY_ACTIVE']),
    body('primary_goal').optional().isIn(['WEIGHT_LOSS', 'MUSCLE_GAIN', 'MAINTENANCE', 'ENDURANCE', 'FLEXIBILITY', 'GENERAL_FITNESS']),
    body('body_fat_pct').optional().isFloat({ min: 3, max: 70 }),
  ],
  validate,
  ctrl.upsertProfile
);

// GET /api/profile
router.get('/', ctrl.getProfile);

// POST /api/profile/goals
router.post('/goals',
  [
    body('target_calories').isInt({ min: 500, max: 10000 }).withMessage('Calories must be 500-10000'),
    body('target_protein_g').isFloat({ min: 10, max: 500 }).withMessage('Protein must be 10-500g'),
    body('target_carbs_g').isFloat({ min: 10, max: 1000 }).withMessage('Carbs must be 10-1000g'),
    body('target_fats_g').isFloat({ min: 10, max: 500 }).withMessage('Fats must be 10-500g'),
    body('target_fiber_g').optional().isFloat({ min: 0, max: 100 }),
    body('target_water_ml').optional().isInt({ min: 500, max: 10000 }),
  ],
  validate,
  ctrl.setGoals
);

// GET /api/profile/goals
router.get('/goals', ctrl.getGoals);

// PATCH /api/profile/weight
router.patch('/weight',
  [
    body('weight_kg').isFloat({ min: 20, max: 500 }).withMessage('Weight must be 20-500 kg'),
  ],
  validate,
  ctrl.updateWeight
);

// GET /api/profile/recommended-macros
router.get('/recommended-macros', ctrl.getRecommendedMacros);

module.exports = router;
