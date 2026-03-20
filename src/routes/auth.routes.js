// src/routes/auth.routes.js
'use strict';

const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { authLimiter, otpLimiter } = require('../middleware/rateLimit');

// POST /api/auth/register
router.post('/register',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('pin').isLength({ min: 6, max: 6 }).isNumeric().withMessage('PIN must be exactly 6 digits'),
    body('name').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Name must be 1-100 chars'),
    body('phone').optional().isMobilePhone('en-IN').withMessage('Valid Indian phone number required'),
  ],
  validate,
  ctrl.register
);

// POST /api/auth/login
router.post('/login',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('pin').isLength({ min: 6, max: 6 }).isNumeric().withMessage('PIN must be 6 digits'),
  ],
  validate,
  ctrl.login
);

// POST /api/auth/forgot-password
router.post('/forgot-password',
  otpLimiter,
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  ],
  validate,
  ctrl.forgotPassword
);

// POST /api/auth/reset-pin
router.post('/reset-pin',
  otpLimiter,
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('otp').isLength({ min: 6, max: 6 }).isNumeric().withMessage('OTP must be 6 digits'),
    body('new_pin').isLength({ min: 6, max: 6 }).isNumeric().withMessage('New PIN must be 6 digits'),
  ],
  validate,
  ctrl.resetPin
);

// POST /api/auth/logout
router.post('/logout', authenticate, ctrl.logout);

// POST /api/auth/logout-all
router.post('/logout-all', authenticate, ctrl.logoutAll);

// GET /api/auth/me
router.get('/me', authenticate, ctrl.me);

module.exports = router;
