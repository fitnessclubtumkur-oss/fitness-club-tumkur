// src/routes/sms.routes.js
'use strict';

const router = require('express').Router();
const { body, param } = require('express-validator');
const ctrl   = require('../controllers/sms.controller');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');

router.use(authenticate);

router.post('/sms/order-status',
  [
    body('order_id').notEmpty().withMessage('order_id required'),
    body('status').isIn(['CONFIRMED','PREPARING','OUT_FOR_DELIVERY','DELIVERED','CANCELLED']),
  ],
  validate, ctrl.sendOrderStatusSms
);

router.post('/sms/day-close', ctrl.sendDayCloseSms);

router.post('/sms/renewal/:subscription_id', ctrl.sendRenewalReminder);

router.get('/sms/logs', ctrl.getSmsLogs);

module.exports = router;
