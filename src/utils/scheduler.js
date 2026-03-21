// src/utils/scheduler.js
// Sprint 3 — node-cron background jobs
// Weekly AI insights · Daily leaderboard compute · Renewal SMS reminders
'use strict';

const cron   = require('node-cron');
const prisma = require('../config/db');
const logger = require('../utils/logger');

let schedulerStarted = false;

function startScheduler() {
  if (schedulerStarted) return;
  if (!process.env.DATABASE_URL) {
    logger.warn('[scheduler] DATABASE_URL not set — skipping scheduled jobs');
    return;
  }

  schedulerStarted = true;
  logger.info('[scheduler] Starting background jobs');

  // ── 1. WEEKLY AI INSIGHTS — Every Sunday 6pm IST (12:30 UTC) ──────────────
  cron.schedule('30 12 * * 0', async () => {
    logger.info('[scheduler] Running weekly AI insight generation');
    try {
      if (!process.env.CLAUDE_API_KEY) {
        logger.warn('[scheduler] CLAUDE_API_KEY not set — skipping insights');
        return;
      }

      // Get all users with profiles who haven't got an insight this week
      const weekOf = getWeekStart();
      const users  = await prisma.fitnessProfile.findMany({
        select: { user_id: true },
      });

      const existingInsights = await prisma.aiInsight.findMany({
        where:  { week_of: weekOf },
        select: { user_id: true },
      });
      const alreadyDone = new Set(existingInsights.map(i => i.user_id));

      let generated = 0, skipped = 0, failed = 0;
      for (const { user_id } of users) {
        if (alreadyDone.has(user_id)) { skipped++; continue; }
        try {
          const aiCtrl = require('../controllers/ai.controller');
          await generateInsightForUser(user_id, weekOf);
          generated++;
          await sleep(2000); // rate-limit: 0.5 rps
        } catch (e) {
          logger.warn({ user_id, err: e.message }, 'Insight gen failed for user');
          failed++;
        }
      }
      logger.info({ generated, skipped, failed }, '[scheduler] Weekly insights done');
    } catch (err) {
      logger.error({ err }, '[scheduler] Weekly insight job error');
    }
  }, { timezone: 'UTC' });

  // ── 2. DAILY LEADERBOARDS — Every day at 1am IST (7:30pm UTC prev day) ────
  cron.schedule('30 19 * * *', async () => {
    logger.info('[scheduler] Computing daily leaderboards');
    try {
      const { computeLeaderboard } = require('../controllers/gamification.controller');
      const period    = 'MONTHLY';
      const periodKey = getPeriodKey('MONTHLY');
      const types     = ['MOST_ACTIVE', 'POINTS', 'MACRO_ADHERENCE'];

      for (const type of types) {
        try {
          await computeLeaderboard(type, period, periodKey);
          logger.info({ type }, '[scheduler] Leaderboard computed');
        } catch (e) {
          logger.warn({ type, err: e.message }, '[scheduler] Leaderboard compute failed');
        }
      }
    } catch (err) {
      logger.error({ err }, '[scheduler] Leaderboard job error');
    }
  }, { timezone: 'UTC' });

  // ── 3. SUBSCRIPTION RENEWAL REMINDERS — Daily 9am IST (3:30 UTC) ─────────
  cron.schedule('30 3 * * *', async () => {
    logger.info('[scheduler] Checking subscription renewals');
    try {
      if (!process.env.MSG91_AUTH_KEY) {
        logger.warn('[scheduler] MSG91_AUTH_KEY not set — skipping renewal SMS');
        return;
      }

      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
      threeDaysFromNow.setHours(23, 59, 59, 999);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      const dueSubs = await prisma.subscription.findMany({
        where: {
          status:            'ACTIVE',
          next_billing_date: { gte: tomorrow, lte: threeDaysFromNow },
        },
        include: { user: { select: { name: true, phone: true } } },
      });

      const { sendSms, logSms } = require('../controllers/sms.controller');
      let sent = 0;

      for (const sub of dueSubs) {
        if (!sub.user.phone) continue;
        const daysLeft = Math.ceil((new Date(sub.next_billing_date) - new Date()) / 86400000);
        const msg = `FitFuel: Hi ${sub.user.name}! "${sub.plan_name}" renews in ${daysLeft} day(s) — ₹${sub.price_inr}. Manage at ${process.env.APP_URL || 'your app'}.`;

        const result = await sendSms({ phone: sub.user.phone, message: msg });
        await logSms(sub.user_id, sub.user.phone, null, msg, result.success ? 'SENT' : 'FAILED');
        if (result.success) sent++;
        await sleep(500);
      }

      logger.info({ sent, total: dueSubs.length }, '[scheduler] Renewal reminders sent');
    } catch (err) {
      logger.error({ err }, '[scheduler] Renewal reminder job error');
    }
  }, { timezone: 'UTC' });

  // ── 4. DAY-CLOSE SUMMARY SMS — Every day 9pm IST (3:30pm UTC) ─────────────
  cron.schedule('30 15 * * *', async () => {
    logger.info('[scheduler] Sending day-close summaries');
    try {
      if (!process.env.MSG91_AUTH_KEY) return;

      // Get users who opted in (has phone + logged today)
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const summaries = await prisma.dailySummary.findMany({
        where: { date: today, total_calories_consumed: { gt: 0 } },
        include: {
          user: { select: { id: true, name: true, phone: true } },
        },
        take: 500, // max per run
      });

      const { sendSms, logSms } = require('../controllers/sms.controller');
      let sent = 0;

      for (const summary of summaries) {
        if (!summary.user.phone) continue;

        const goals = await prisma.userGoal.findFirst({
          where: { user_id: summary.user_id, is_active: true },
        });

        const cal_pct  = goals ? Math.round((summary.total_calories_consumed / goals.target_calories) * 100) : null;
        const prot_pct = goals ? Math.round((summary.total_protein_g / goals.target_protein_g) * 100) : null;

        const msg = `FitFuel 📊 ${summary.user.name}, today: ${summary.total_calories_consumed} kcal${cal_pct ? ` (${cal_pct}%)` : ''}, ${summary.total_protein_g}g protein${prot_pct ? ` (${prot_pct}%)` : ''}. ${prot_pct && prot_pct < 80 ? 'Tip: Add eggs/paneer to hit protein goal!' : 'Keep it up! 💪'}`;

        const result = await sendSms({ phone: summary.user.phone, message: msg });
        await logSms(summary.user_id, summary.user.phone, null, msg, result.success ? 'SENT' : 'FAILED');
        if (result.success) sent++;
        await sleep(300);
      }

      logger.info({ sent, total: summaries.length }, '[scheduler] Day-close SMS done');
    } catch (err) {
      logger.error({ err }, '[scheduler] Day-close SMS job error');
    }
  }, { timezone: 'UTC' });

  // ── 5. ACHIEVEMENT CHECK — Every night at 11pm IST (5:30pm UTC) ───────────
  cron.schedule('30 17 * * *', async () => {
    logger.info('[scheduler] Running daily achievement checks');
    try {
      const { checkAndAwardAchievements } = require('../controllers/gamification.controller');
      const users = await prisma.fitnessProfile.findMany({ select: { user_id: true }, take: 1000 });
      let awarded = 0;
      for (const { user_id } of users) {
        const newBadges = await checkAndAwardAchievements(user_id);
        if (newBadges.length) awarded += newBadges.length;
        await sleep(100);
      }
      logger.info({ awarded }, '[scheduler] Achievement check done');
    } catch (err) {
      logger.error({ err }, '[scheduler] Achievement job error');
    }
  }, { timezone: 'UTC' });

  logger.info('[scheduler] ✅ All 5 jobs scheduled');
}

// ── GENERATE INSIGHT FOR ONE USER ─────────────────────────────────────────────
async function generateInsightForUser(userId, weekOf) {
  const [profile, goals, workouts, summaries, moods] = await Promise.all([
    prisma.fitnessProfile.findUnique({ where: { user_id: userId } }),
    prisma.userGoal.findFirst({ where: { user_id: userId, is_active: true } }),
    prisma.workout.findMany({ where: { user_id: userId, date: { gte: new Date(Date.now() - 28 * 86400000) } } }),
    prisma.dailySummary.findMany({ where: { user_id: userId, date: { gte: new Date(Date.now() - 28 * 86400000) } } }),
    prisma.moodTracking.findMany({ where: { user_id: userId, date: { gte: new Date(Date.now() - 28 * 86400000) } } }),
  ]);

  if (!profile || !goals || workouts.length < 3) return; // Not enough data

  // Call Claude
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 600,
      system: 'You are FitFuel AI coach. Write a motivational 300-word weekly fitness narrative for an Indian user. Reference their exact numbers. Suggest Indian foods. End with 3 action items.',
      messages: [{
        role: 'user',
        content: `User: ${profile.age}yr ${profile.gender}, ${profile.weight_kg}kg, Goal: ${profile.primary_goal}\nTargets: ${goals.target_calories}kcal, ${goals.target_protein_g}g protein\nLast 4 weeks: ${workouts.length} workouts, avg ${summaries.length ? (summaries.reduce((s,d)=>s+d.total_calories_consumed,0)/summaries.length).toFixed(0) : 0} kcal/day, ${summaries.length ? (summaries.reduce((s,d)=>s+d.total_protein_g,0)/summaries.length).toFixed(0) : 0}g protein/day\nGenerate their weekly fitness story.`,
      }],
    }),
  });

  if (!res.ok) throw new Error(`Claude API ${res.status}`);
  const data = await res.json();
  const narrative = data.content?.[0]?.text || '';
  if (!narrative) return;

  await prisma.aiInsight.upsert({
    where:  { user_id_week_of: { user_id: userId, week_of: weekOf } },
    create: { user_id: userId, week_of: weekOf, narrative_text: narrative, key_metrics: {}, recommendations: [] },
    update: { narrative_text: narrative, generated_at: new Date() },
  });
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function getWeekStart() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function getPeriodKey(period) {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { startScheduler };
