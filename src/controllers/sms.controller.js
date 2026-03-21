// src/controllers/sms.controller.js
// Sprint 3 — MSG91 SMS: order alerts, day-close summary, renewal reminders
'use strict';

const prisma = require('../config/db');
const { success, error } = require('../utils/response');
const logger = require('../utils/logger');

// ── MSG91 TEMPLATES ───────────────────────────────────────────────────────────
const TEMPLATES = {
  ORDER_CONFIRMED:   process.env.MSG91_TPL_ORDER    || '',
  ORDER_DELIVERED:   process.env.MSG91_TPL_DELIVERED || '',
  DAY_CLOSE:         process.env.MSG91_TPL_DAYCLOSE  || '',
  SUBSCRIPTION_RENEW: process.env.MSG91_TPL_RENEW   || '',
  OTP:               process.env.MSG91_TPL_OTP       || '',
};

// ── SEND SMS ──────────────────────────────────────────────────────────────────
async function sendSms({ phone, template_id, variables, message }) {
  const authKey = process.env.MSG91_AUTH_KEY;

  if (!authKey) {
    logger.warn('MSG91_AUTH_KEY not set — SMS not sent');
    return { success: false, reason: 'MSG91 not configured' };
  }

  // Normalise phone: ensure +91 prefix
  const normalized = phone.startsWith('+') ? phone : `+91${phone.replace(/^0/, '')}`;

  try {
    // MSG91 flow-based API
    const payload = {
      template_id: template_id || TEMPLATES.DAY_CLOSE,
      short_url:   '0',
      recipients: [{
        mobiles:   normalized,
        ...variables,
      }],
    };

    const res = await fetch('https://control.msg91.com/api/v5/flow/', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'authkey':      authKey,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    logger.info({ phone: normalized, template_id, type: data.type }, 'SMS sent');
    return { success: data.type === 'success', data };
  } catch (err) {
    logger.error({ err, phone: normalized }, 'SMS send error');
    return { success: false, error: err.message };
  }
}

// ── LOG SMS ───────────────────────────────────────────────────────────────────
async function logSms(userId, phone, template_id, message, status) {
  await prisma.smsLog.create({
    data: { user_id: userId, phone, template_id: template_id || null, message, status },
  }).catch(() => {});
}

// ── SEND ORDER STATUS SMS ─────────────────────────────────────────────────────
async function sendOrderStatusSms(req, res) {
  try {
    const { order_id, status } = req.body;
    const userId = req.user.id;

    const order = await prisma.order.findFirst({
      where:   { id: order_id, user_id: userId },
      include: { user: { select: { phone: true, name: true } } },
    });
    if (!order) return error(res, 'Order not found', 404);
    if (!order.user.phone) return error(res, 'No phone number on account');

    const messages = {
      CONFIRMED:        `Hi ${order.user.name}! ✅ Your FitFuel order #${order_id.slice(-6).toUpperCase()} is confirmed. Total: ₹${order.total_inr}. We'll keep you updated!`,
      PREPARING:        `👨‍🍳 Your FitFuel meal is being freshly prepared! Order #${order_id.slice(-6).toUpperCase()}`,
      OUT_FOR_DELIVERY: `🛵 Your FitFuel order is on the way! ETA ~20 mins. OTP: ${order.otp}`,
      DELIVERED:        `🎉 Delivered! Enjoy your healthy meal, ${order.user.name}! Log it to your tracker: ${process.env.APP_URL || 'https://fitness-club-tumkur-production.up.railway.app'}`,
    };

    const message = messages[status] || `Your order status: ${status}`;
    const result  = await sendSms({
      phone:       order.user.phone,
      template_id: TEMPLATES.ORDER_CONFIRMED,
      variables:   { name: order.user.name, order_id: order_id.slice(-6).toUpperCase(), status, amount: `${order.total_inr}` },
      message,
    });

    await logSms(userId, order.user.phone, TEMPLATES.ORDER_CONFIRMED, message, result.success ? 'SENT' : 'FAILED');
    return success(res, { result, message }, 'SMS sent');
  } catch (err) {
    logger.error({ err }, 'Order status SMS error');
    throw err;
  }
}

// ── SEND DAY-CLOSE SUMMARY SMS ────────────────────────────────────────────────
async function sendDayCloseSms(req, res) {
  try {
    const userId = req.user.id;
    const today  = new Date(); today.setHours(0, 0, 0, 0);

    const [user, summary, goals, workouts] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { name: true, phone: true } }),
      prisma.dailySummary.findUnique({ where: { user_id_date: { user_id: userId, date: today } } }),
      prisma.userGoal.findFirst({ where: { user_id: userId, is_active: true } }),
      prisma.workout.findMany({ where: { user_id: userId, date: today } }),
    ]);

    if (!user?.phone) return error(res, 'No phone number on account. Add it in your profile.');

    const cal_in   = summary?.total_calories_consumed || 0;
    const cal_out  = workouts.reduce((s, w) => s + w.calories_burned, 0);
    const protein  = summary?.total_protein_g || 0;
    const goal_cal = goals?.target_calories || 2000;
    const goal_prot= goals?.target_protein_g || 100;

    const calPct  = Math.round((cal_in / goal_cal)   * 100);
    const protPct = Math.round((protein / goal_prot) * 100);
    const streak  = await getStreak(userId);

    const message = `FitFuel Daily Summary 📊\n${user.name}, here's your day:\n🍽 Calories: ${cal_in}/${goal_cal} kcal (${calPct}%)\n💪 Protein: ${protein}g/${goal_prot}g (${protPct}%)\n🔥 Burned: ${cal_out} kcal\n🏃 Workouts: ${workouts.length}\n⚡ Streak: ${streak} days\n${protPct < 80 ? '⚠️ Tip: Have some paneer/eggs tonight to hit protein goal!' : '✅ Great macros today!'}`;

    const result = await sendSms({
      phone:       user.phone,
      template_id: TEMPLATES.DAY_CLOSE,
      variables:   { name: user.name, calories: `${cal_in}`, protein: `${protein}`, streak: `${streak}` },
      message,
    });

    await logSms(userId, user.phone, TEMPLATES.DAY_CLOSE, message, result.success ? 'SENT' : 'FAILED');
    return success(res, { result, summary: { cal_in, cal_out, protein, streak } }, 'Day-close SMS sent');
  } catch (err) {
    logger.error({ err }, 'Day-close SMS error');
    throw err;
  }
}

// ── SEND SUBSCRIPTION RENEWAL REMINDER ───────────────────────────────────────
async function sendRenewalReminder(req, res) {
  try {
    const { subscription_id } = req.params;
    const userId = req.user.id;

    const sub = await prisma.subscription.findFirst({
      where:   { id: subscription_id, user_id: userId, status: 'ACTIVE' },
      include: { user: { select: { name: true, phone: true } } },
    });
    if (!sub) return error(res, 'Subscription not found', 404);
    if (!sub.user.phone) return error(res, 'No phone number on account');

    const daysLeft = Math.ceil((new Date(sub.next_billing_date) - new Date()) / 86400000);
    const message  = `FitFuel Reminder 🔔\nHi ${sub.user.name}! Your "${sub.plan_name}" plan renews in ${daysLeft} day(s) on ${new Date(sub.next_billing_date).toLocaleDateString('en-IN')} for ₹${sub.price_inr}.\nManage: ${process.env.APP_URL || 'https://fitness-club-tumkur-production.up.railway.app'}`;

    const result = await sendSms({
      phone:       sub.user.phone,
      template_id: TEMPLATES.SUBSCRIPTION_RENEW,
      variables:   { name: sub.user.name, plan: sub.plan_name, days: `${daysLeft}`, amount: `${sub.price_inr}` },
      message,
    });

    await logSms(userId, sub.user.phone, TEMPLATES.SUBSCRIPTION_RENEW, message, result.success ? 'SENT' : 'FAILED');
    return success(res, { result, days_left: daysLeft }, 'Renewal reminder sent');
  } catch (err) {
    logger.error({ err }, 'Renewal reminder SMS error');
    throw err;
  }
}

// ── SEND CUSTOM SMS (admin) ───────────────────────────────────────────────────
async function sendCustomSms(req, res) {
  try {
    const { user_id, message } = req.body;

    const user = await prisma.user.findUnique({ where: { id: user_id }, select: { name: true, phone: true } });
    if (!user?.phone) return error(res, 'User has no phone number');

    const result = await sendSms({ phone: user.phone, message });
    await logSms(user_id, user.phone, null, message, result.success ? 'SENT' : 'FAILED');
    return success(res, { result }, 'SMS sent');
  } catch (err) {
    logger.error({ err }, 'Custom SMS error');
    throw err;
  }
}

// ── GET SMS LOGS ──────────────────────────────────────────────────────────────
async function getSmsLogs(req, res) {
  try {
    const logs = await prisma.smsLog.findMany({
      where:   { user_id: req.user.id },
      orderBy: { created_at: 'desc' },
      take:    50,
    });
    return success(res, { logs });
  } catch (err) {
    logger.error({ err }, 'Get SMS logs error');
    throw err;
  }
}

// ── HELPER ────────────────────────────────────────────────────────────────────
async function getStreak(userId) {
  const workouts = await prisma.workout.findMany({
    where:   { user_id: userId },
    select:  { date: true },
    orderBy: { date: 'desc' },
    take:    100,
  });
  const dates = [...new Set(workouts.map(w => w.date?.toISOString().split('T')[0]))].sort().reverse();
  let streak = 0;
  for (let i = 0; i < dates.length; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    if (dates[i] === d.toISOString().split('T')[0]) streak++;
    else break;
  }
  return streak;
}

// Export sendSms for use by scheduler
module.exports = {
  sendOrderStatusSms, sendDayCloseSms, sendRenewalReminder, sendCustomSms, getSmsLogs,
  sendSms, logSms,
};
