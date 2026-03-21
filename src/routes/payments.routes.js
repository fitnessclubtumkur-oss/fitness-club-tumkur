// src/routes/payments.routes.js
'use strict';

const router = require('express').Router();
const { body, query } = require('express-validator');
const ctrl   = require('../controllers/payments.controller');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');

// Razorpay webhook — no auth, raw body needed
router.post('/payments/webhook', ctrl.handleWebhook);

router.use(authenticate);

router.post('/payments/order',
  [
    body('kitchen_order_id').notEmpty().withMessage('kitchen_order_id required'),
    body('amount_inr').optional().isFloat({ min: 1 }),
  ],
  validate, ctrl.createOrderPayment
);

router.post('/payments/subscription',
  [body('subscription_id').notEmpty().withMessage('subscription_id required')],
  validate, ctrl.createSubscriptionPayment
);

router.post('/payments/verify',
  [
    body('razorpay_order_id').notEmpty(),
    body('razorpay_payment_id').notEmpty(),
    body('razorpay_signature').notEmpty(),
  ],
  validate, ctrl.verifyPayment
);

router.get('/payments/history',
  [query('page').optional().isInt({ min: 1 })],
  validate, ctrl.getPaymentHistory
);

module.exports = router;
