// src/routes/kitchen.routes.js
'use strict';

const router = require('express').Router();
const { body, query, param } = require('express-validator');
const ctrl = require('../controllers/kitchen.controller');
const { authenticate, optionalAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');

// ─── PUBLIC (no auth) ─────────────────────────────────────────────────────────
router.get('/kitchens',          optionalAuth, [query('city').optional().trim()], validate, ctrl.listKitchens);
router.get('/kitchens/:id',      optionalAuth, ctrl.getKitchen);
router.get('/kitchens/:id/status', optionalAuth, ctrl.getKitchenStatus);
router.get('/kitchen-meals',     optionalAuth, ctrl.listMeals);
router.get('/kitchen-meals/:id', optionalAuth, ctrl.getMeal);
router.get('/kitchen-meals/:meal_id/reviews', optionalAuth, ctrl.getMealReviews);

// Swiggy/Zomato webhook (no auth — verified by signature in production)
router.post('/webhooks/delivery', ctrl.handleDeliveryWebhook);

// ─── AUTH REQUIRED ────────────────────────────────────────────────────────────
router.use(authenticate);

// Kitchen registration (admin only in production — open for now)
router.post('/kitchens',
  [
    body('name').notEmpty().withMessage('Kitchen name required'),
    body('city').notEmpty().withMessage('City required'),
    body('address').notEmpty().withMessage('Address required'),
    body('lat').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude required'),
    body('lng').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude required'),
    body('phone').notEmpty().withMessage('Phone required'),
    body('email').isEmail().withMessage('Valid email required'),
    body('delivery_zones').isArray().withMessage('delivery_zones must be an array'),
  ],
  validate, ctrl.registerKitchen
);

// Menu management
router.post('/kitchen-meals',
  [
    body('name').notEmpty().withMessage('Meal name required'),
    body('category').isIn(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']).withMessage('Invalid category'),
    body('price_inr').isFloat({ min: 1 }).withMessage('Price must be positive'),
    body('calories').isFloat({ min: 0 }).withMessage('Calories required'),
    body('protein_g').isFloat({ min: 0 }).withMessage('Protein required'),
    body('carbs_g').isFloat({ min: 0 }).withMessage('Carbs required'),
    body('fats_g').isFloat({ min: 0 }).withMessage('Fats required'),
    body('serving_weight').isInt({ min: 1 }).withMessage('Serving weight required'),
  ],
  validate, ctrl.createMeal
);
router.put('/kitchen-meals/:id', ctrl.updateMeal);

// Orders
router.post('/orders',
  [
    body('kitchen_id').notEmpty().withMessage('kitchen_id required'),
    body('items').isArray({ min: 1 }).withMessage('items must be non-empty array'),
    body('items.*.kitchen_meal_id').notEmpty().withMessage('kitchen_meal_id required for each item'),
    body('items.*.quantity').isInt({ min: 1 }).withMessage('quantity must be ≥ 1'),
    body('items.*.meal_type').isIn(['BREAKFAST', 'LUNCH', 'SNACK', 'DINNER', 'PRE_WORKOUT', 'POST_WORKOUT']),
    body('delivery_address').notEmpty().withMessage('Delivery address required'),
  ],
  validate, ctrl.placeOrder
);
router.get('/orders', ctrl.listOrders);
router.get('/orders/:id', ctrl.getOrder);
router.post('/orders/:id/cancel', ctrl.cancelOrder);
router.get('/orders/:id/track', ctrl.trackDelivery);
router.post('/orders/:id/otp-verify',
  [body('otp').isLength({ min: 4, max: 4 }).isNumeric().withMessage('4-digit OTP required')],
  validate, ctrl.verifyDeliveryOTP
);

// Auto-log
router.post('/nutrition/auto-log',
  [
    body('order_id').notEmpty().withMessage('order_id required'),
    body('meal_id').notEmpty().withMessage('meal_id required'),
    body('meal_type').optional().isIn(['BREAKFAST', 'LUNCH', 'SNACK', 'DINNER', 'PRE_WORKOUT', 'POST_WORKOUT']),
  ],
  validate, ctrl.autoLogDeliveredMeal
);

// Reviews
router.post('/reviews',
  [
    body('order_id').notEmpty().withMessage('order_id required'),
    body('kitchen_meal_id').notEmpty().withMessage('kitchen_meal_id required'),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1-5'),
    body('taste_rating').optional().isInt({ min: 1, max: 5 }),
    body('freshness_rating').optional().isInt({ min: 1, max: 5 }),
    body('packaging_rating').optional().isInt({ min: 1, max: 5 }),
    body('delivery_rating').optional().isInt({ min: 1, max: 5 }),
    body('would_reorder').optional().isBoolean(),
    body('review_text').optional().trim().isLength({ max: 1000 }),
  ],
  validate, ctrl.submitReview
);

// Subscriptions
router.post('/subscriptions',
  [
    body('plan_name').notEmpty().withMessage('plan_name required'),
    body('plan').isIn(['DAILY', 'WEEKLY', 'MONTHLY']).withMessage('plan must be DAILY, WEEKLY, or MONTHLY'),
    body('price_inr').isFloat({ min: 1 }).withMessage('price_inr required'),
    body('meals_per_day').optional().isInt({ min: 1, max: 5 }),
  ],
  validate, ctrl.createSubscription
);
router.get('/subscriptions', ctrl.getSubscriptions);
router.put('/subscriptions/:id/pause',
  [
    body('pause_from_date').isISO8601().withMessage('pause_from_date required'),
    body('pause_until_date').isISO8601().withMessage('pause_until_date required'),
  ],
  validate, ctrl.pauseSubscription
);
router.put('/subscriptions/:id/resume', ctrl.resumeSubscription);
router.put('/subscriptions/:id/cancel', ctrl.cancelSubscription);

// Kitchen staff endpoints
router.get('/kitchens/:kitchen_id/orders', ctrl.getOrderQueue);
router.patch('/orders/:id/status',
  [body('status').isIn(['CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'])],
  validate, ctrl.updateOrderStatus
);

// Delivery partner update
router.post('/delivery/update',
  [
    body('order_id').notEmpty(),
    body('status').isIn(['PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'FAILED']),
  ],
  validate, ctrl.updateDeliveryStatus
);

// Inventory
router.get('/kitchens/:kitchen_id/inventory', ctrl.getInventory);
router.post('/kitchens/:kitchen_id/inventory',
  [
    body('ingredient').notEmpty(),
    body('stock_kg').isFloat({ min: 0 }),
  ],
  validate, ctrl.updateInventory
);

module.exports = router;
