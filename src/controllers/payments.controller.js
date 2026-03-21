// src/controllers/payments.controller.js
// Sprint 3 — Razorpay UPI payments + subscription billing
'use strict';

const prisma = require('../config/db');
const config = require('../config');
const { success, created, error, notFound } = require('../utils/response');
const logger = require('../utils/logger');
const crypto = require('crypto');

// ── RAZORPAY CLIENT ───────────────────────────────────────────────────────────
function getRazorpay() {
  const key_id     = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;

  if (!key_id || !key_secret) {
    throw Object.assign(
      new Error('Razorpay not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to Railway Variables.'),
      { code: 'NO_RAZORPAY' }
    );
  }

  const Razorpay = require('razorpay');
  return new Razorpay({ key_id, key_secret });
}

function noKeyError(res) {
  return error(res, 'Payments not configured. Add RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET in Railway Variables.', 503);
}

// ── CREATE ORDER PAYMENT ──────────────────────────────────────────────────────
async function createOrderPayment(req, res) {
  try {
    const { kitchen_order_id, amount_inr, notes } = req.body;
    const userId = req.user.id;

    // Verify the order exists and belongs to the user
    const order = await prisma.order.findFirst({
      where: { id: kitchen_order_id, user_id: userId },
    });
    if (!order) return notFound(res, 'Order not found');
    if (order.status !== 'PENDING') return error(res, 'Order already paid or cancelled');

    const razorpay = getRazorpay();
    const rz_order = await razorpay.orders.create({
      amount:          Math.round((amount_inr || order.total_inr) * 100), // paise
      currency:        'INR',
      receipt:         `order_${kitchen_order_id.slice(-8)}`,
      notes:           { order_id: kitchen_order_id, user_id: userId, ...notes },
    });

    // Save payment record
    const payment = await prisma.payment.create({
      data: {
        user_id:          userId,
        order_id:         kitchen_order_id,
        razorpay_order_id: rz_order.id,
        amount_inr:       amount_inr || order.total_inr,
        status:           'CREATED',
        description:      `FitFuel Kitchen Order`,
      },
    });

    return created(res, {
      razorpay_order_id: rz_order.id,
      amount_paise:      rz_order.amount,
      currency:          rz_order.currency,
      key_id:            process.env.RAZORPAY_KEY_ID,
      payment_id:        payment.id,
      prefill: {
        name:  req.user.name,
        email: req.user.email,
        contact: req.user.phone || '',
      },
    }, 'Payment order created');
  } catch (err) {
    if (err.code === 'NO_RAZORPAY') return noKeyError(res);
    logger.error({ err }, 'Create order payment error');
    throw err;
  }
}

// ── CREATE SUBSCRIPTION PAYMENT ───────────────────────────────────────────────
async function createSubscriptionPayment(req, res) {
  try {
    const { subscription_id } = req.body;
    const userId = req.user.id;

    const sub = await prisma.subscription.findFirst({
      where: { id: subscription_id, user_id: userId, status: 'ACTIVE' },
    });
    if (!sub) return notFound(res, 'Active subscription not found');

    const razorpay = getRazorpay();
    const rz_order = await razorpay.orders.create({
      amount:   Math.round(sub.price_inr * 100),
      currency: 'INR',
      receipt:  `sub_${subscription_id.slice(-8)}`,
      notes:    { subscription_id, user_id: userId },
    });

    const payment = await prisma.payment.create({
      data: {
        user_id:           userId,
        subscription_id,
        razorpay_order_id: rz_order.id,
        amount_inr:        sub.price_inr,
        status:            'CREATED',
        description:       `FitFuel ${sub.plan_name} subscription`,
      },
    });

    return created(res, {
      razorpay_order_id: rz_order.id,
      amount_paise:      rz_order.amount,
      currency:          'INR',
      key_id:            process.env.RAZORPAY_KEY_ID,
      payment_id:        payment.id,
      plan_name:         sub.plan_name,
    }, 'Subscription payment order created');
  } catch (err) {
    if (err.code === 'NO_RAZORPAY') return noKeyError(res);
    logger.error({ err }, 'Create subscription payment error');
    throw err;
  }
}

// ── VERIFY PAYMENT (client calls after Razorpay modal success) ────────────────
async function verifyPayment(req, res) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    // Verify signature
    const key_secret = process.env.RAZORPAY_KEY_SECRET;
    if (!key_secret) return noKeyError(res);

    const expected = crypto
      .createHmac('sha256', key_secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expected !== razorpay_signature) {
      logger.warn({ razorpay_order_id }, 'Payment signature mismatch');
      return error(res, 'Payment verification failed — invalid signature');
    }

    // Update payment record
    const payment = await prisma.payment.findUnique({
      where: { razorpay_order_id },
    });
    if (!payment) return notFound(res, 'Payment record not found');

    await prisma.payment.update({
      where: { razorpay_order_id },
      data:  { razorpay_payment_id, razorpay_signature, status: 'CAPTURED' },
    });

    // If kitchen order — mark as CONFIRMED
    if (payment.order_id) {
      await prisma.order.update({
        where: { id: payment.order_id },
        data:  { status: 'CONFIRMED' },
      });
    }

    // If subscription — extend next billing date
    if (payment.subscription_id) {
      const sub = await prisma.subscription.findUnique({ where: { id: payment.subscription_id } });
      if (sub) {
        const nextBilling = new Date(sub.next_billing_date || new Date());
        if (sub.plan === 'WEEKLY')  nextBilling.setDate(nextBilling.getDate() + 7);
        if (sub.plan === 'MONTHLY') nextBilling.setMonth(nextBilling.getMonth() + 1);
        if (sub.plan === 'DAILY')   nextBilling.setDate(nextBilling.getDate() + 1);

        await prisma.subscription.update({
          where: { id: sub.id },
          data:  { next_billing_date: nextBilling, status: 'ACTIVE' },
        });
      }
    }

    logger.info({ razorpay_payment_id, amount: payment.amount_inr }, 'Payment verified ✅');
    return success(res, {
      verified: true,
      payment_id: razorpay_payment_id,
      amount_inr: payment.amount_inr,
    }, '✅ Payment successful!');
  } catch (err) {
    logger.error({ err }, 'Verify payment error');
    throw err;
  }
}

// ── RAZORPAY WEBHOOK ──────────────────────────────────────────────────────────
async function handleWebhook(req, res) {
  try {
    const secret    = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];

    // Verify webhook signature
    if (secret && signature) {
      const expected = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(req.body))
        .digest('hex');
      if (expected !== signature) {
        logger.warn('Invalid webhook signature');
        return res.status(400).json({ error: 'Invalid signature' });
      }
    }

    const { event, payload } = req.body;
    const payment = payload?.payment?.entity;

    logger.info({ event, payment_id: payment?.id }, 'Razorpay webhook received');

    switch (event) {
      case 'payment.captured': {
        const rz_order_id = payment?.order_id;
        if (rz_order_id) {
          await prisma.payment.updateMany({
            where: { razorpay_order_id: rz_order_id },
            data:  { razorpay_payment_id: payment.id, status: 'CAPTURED', method: payment.method },
          });
          // Confirm linked kitchen order
          const pmt = await prisma.payment.findFirst({ where: { razorpay_order_id: rz_order_id } });
          if (pmt?.order_id) {
            await prisma.order.update({ where: { id: pmt.order_id }, data: { status: 'CONFIRMED' } });
          }
        }
        break;
      }
      case 'payment.failed': {
        const rz_order_id = payment?.order_id;
        if (rz_order_id) {
          await prisma.payment.updateMany({
            where: { razorpay_order_id: rz_order_id },
            data:  { status: 'FAILED' },
          });
        }
        break;
      }
      case 'refund.created': {
        const rz_payment_id = payload?.refund?.entity?.payment_id;
        if (rz_payment_id) {
          await prisma.payment.updateMany({
            where: { razorpay_payment_id: rz_payment_id },
            data:  { status: 'REFUNDED' },
          });
        }
        break;
      }
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    logger.error({ err }, 'Webhook error');
    return res.status(200).json({ received: true }); // Always 200 Razorpay
  }
}

// ── GET PAYMENT HISTORY ───────────────────────────────────────────────────────
async function getPaymentHistory(req, res) {
  try {
    const { page = 1, limit = 20 } = req.query;
    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where:   { user_id: req.user.id },
        orderBy: { created_at: 'desc' },
        skip:    (page - 1) * limit,
        take:    parseInt(limit),
      }),
      prisma.payment.count({ where: { user_id: req.user.id } }),
    ]);

    const totalSpent = await prisma.payment.aggregate({
      where: { user_id: req.user.id, status: 'CAPTURED' },
      _sum:  { amount_inr: true },
    });

    return success(res, {
      payments,
      total,
      total_spent_inr: totalSpent._sum.amount_inr || 0,
      page: parseInt(page),
    });
  } catch (err) {
    logger.error({ err }, 'Get payment history error');
    throw err;
  }
}

module.exports = {
  createOrderPayment, createSubscriptionPayment,
  verifyPayment, handleWebhook, getPaymentHistory,
};
