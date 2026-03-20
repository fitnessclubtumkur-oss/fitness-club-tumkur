// src/controllers/dashboard.controller.js
'use strict';

const prisma = require('../config/db');
const { success, notFound } = require('../utils/response');
const logger = require('../utils/logger');

// ─── DAILY SUMMARY ────────────────────────────────────────────────────────────
async function getDailySummary(req, res) {
  try {
    const { date } = req.query;
    const userId = req.user.id;
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    const [summary, goals, mealItems, workouts, mood] = await Promise.all([
      prisma.dailySummary.findUnique({
        where: { user_id_date: { user_id: userId, date: targetDate } },
      }),
      prisma.userGoal.findFirst({
        where: { user_id: userId, is_active: true },
        orderBy: { created_at: 'desc' },
      }),
      prisma.mealItem.findMany({
        where: { user_id: userId, date: targetDate },
        include: { food: { select: { id: true, name: true, category: true } } },
        orderBy: [{ meal_type: 'asc' }, { created_at: 'asc' }],
      }),
      prisma.workout.findMany({
        where: { user_id: userId, date: targetDate },
        select: { id: true, type: true, duration_min: true, calories_burned: true, metadata: true },
      }),
      prisma.moodTracking.findUnique({
        where: { user_id_date: { user_id: userId, date: targetDate } },
      }),
    ]);

    // Group meals by meal_type
    const mealsByType = mealItems.reduce((acc, item) => {
      if (!acc[item.meal_type]) acc[item.meal_type] = [];
      acc[item.meal_type].push(item);
      return acc;
    }, {});

    // Compute actuals from meal items (real-time, overrides stale summary)
    const actuals = mealItems.reduce((acc, item) => {
      acc.calories  += item.calories;
      acc.protein_g += item.protein_g;
      acc.carbs_g   += item.carbs_g;
      acc.fats_g    += item.fats_g;
      acc.fiber_g   += item.fiber_g;
      return acc;
    }, { calories: 0, protein_g: 0, carbs_g: 0, fats_g: 0, fiber_g: 0 });

    const caloriesBurned = workouts.reduce((s, w) => s + w.calories_burned, 0);
    const netCalories    = actuals.calories - caloriesBurned;

    // Progress percentages vs goals
    const progress = goals ? {
      calories:  pct(actuals.calories,  goals.target_calories),
      protein_g: pct(actuals.protein_g, goals.target_protein_g),
      carbs_g:   pct(actuals.carbs_g,   goals.target_carbs_g),
      fats_g:    pct(actuals.fats_g,    goals.target_fats_g),
      fiber_g:   pct(actuals.fiber_g,   goals.target_fiber_g),
    } : null;

    // Generate smart warnings
    const warnings = [];
    if (goals) {
      if (progress.protein_g < 50) {
        const needed = (goals.target_protein_g - actuals.protein_g).toFixed(0);
        warnings.push({ type: 'danger', nutrient: 'protein', message: `Protein very low (${actuals.protein_g.toFixed(0)}g / ${goals.target_protein_g}g). Need ${needed}g more — add 150g chicken or 100g paneer.` });
      }
      if (progress.calories > 110) {
        const over = (actuals.calories - goals.target_calories).toFixed(0);
        warnings.push({ type: 'warning', nutrient: 'calories', message: `Calories ${over} kcal over target. Consider a lighter dinner.` });
      }
      if (progress.fiber_g < 50) {
        warnings.push({ type: 'info', nutrient: 'fiber', message: `Fiber at ${actuals.fiber_g.toFixed(1)}g / ${goals.target_fiber_g}g. Add spinach, oats, or fruits.` });
      }
    }

    return success(res, {
      date: targetDate.toISOString().split('T')[0],
      actuals,
      calories_burned: caloriesBurned,
      net_calories: netCalories,
      goals,
      progress,
      warnings,
      meals_by_type: mealsByType,
      workouts,
      mood,
    });
  } catch (err) {
    logger.error({ err }, 'Get daily summary error');
    throw err;
  }
}

// ─── WEEKLY SUMMARY ───────────────────────────────────────────────────────────
async function getWeeklySummary(req, res) {
  try {
    const userId = req.user.id;
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 6);
    startDate.setHours(0, 0, 0, 0);

    const [summaries, workouts, goals] = await Promise.all([
      prisma.dailySummary.findMany({
        where: { user_id: userId, date: { gte: startDate, lte: endDate } },
        orderBy: { date: 'asc' },
      }),
      prisma.workout.findMany({
        where: { user_id: userId, date: { gte: startDate, lte: endDate } },
      }),
      prisma.userGoal.findFirst({
        where: { user_id: userId, is_active: true },
      }),
    ]);

    const weeklyTotals = summaries.reduce((acc, s) => {
      acc.calories  += s.total_calories_consumed;
      acc.protein_g += s.total_protein_g;
      acc.calories_burned += s.total_calories_burned;
      return acc;
    }, { calories: 0, protein_g: 0, calories_burned: 0 });

    const avgCalories = summaries.length ? (weeklyTotals.calories / summaries.length).toFixed(0) : 0;

    const daysGoalMet = goals ? summaries.filter(s =>
      s.total_protein_g >= goals.target_protein_g * 0.9
    ).length : 0;

    return success(res, {
      days: summaries,
      workouts_count: workouts.length,
      weekly_totals: weeklyTotals,
      avg_daily_calories: avgCalories,
      days_protein_goal_met: daysGoalMet,
      goals,
    });
  } catch (err) {
    logger.error({ err }, 'Get weekly summary error');
    throw err;
  }
}

// ─── LOG MOOD ─────────────────────────────────────────────────────────────────
async function logMood(req, res) {
  try {
    const { date, sleep_hours, mood_rating, stress_level, energy_level, recovery_state, notes } = req.body;
    const userId = req.user.id;
    const dateOnly = new Date(date || Date.now());
    dateOnly.setHours(0, 0, 0, 0);

    const mood = await prisma.moodTracking.upsert({
      where: { user_id_date: { user_id: userId, date: dateOnly } },
      create: { user_id: userId, date: dateOnly, sleep_hours, mood_rating, stress_level, energy_level, recovery_state, notes },
      update: { sleep_hours, mood_rating, stress_level, energy_level, recovery_state, notes },
    });

    return success(res, { mood }, 'Mood logged');
  } catch (err) {
    logger.error({ err }, 'Log mood error');
    throw err;
  }
}

// ─── GET MOOD HISTORY ──────────────────────────────────────────────────────────
async function getMoodHistory(req, res) {
  try {
    const { start, end } = req.query;
    const userId = req.user.id;
    const where = { user_id: userId };
    if (start) where.date = { gte: new Date(start) };
    if (end) where.date = { ...where.date, lte: new Date(end) };

    const moods = await prisma.moodTracking.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 30,
    });

    const avgSleep  = avg(moods, 'sleep_hours');
    const avgMood   = avg(moods, 'mood_rating');
    const avgStress = avg(moods, 'stress_level');

    return success(res, { moods, insights: { avg_sleep: avgSleep, avg_mood: avgMood, avg_stress: avgStress } });
  } catch (err) {
    logger.error({ err }, 'Get mood history error');
    throw err;
  }
}

// ─── OFFLINE SYNC ─────────────────────────────────────────────────────────────
async function syncOffline(req, res) {
  try {
    const { items } = req.body;
    // items: [{ method, url, body, client_timestamp }]
    const userId = req.user.id;

    const results = { synced: 0, errors: [] };

    for (const item of items) {
      try {
        // Process each queued request internally
        // In a real app this would call the route handlers internally
        // For now, log and mark synced
        await prisma.syncQueue.create({
          data: {
            user_id: userId,
            method: item.method,
            url: item.url,
            body: item.body,
            synced: true,
            synced_at: new Date(),
          },
        });
        results.synced++;
      } catch (e) {
        results.errors.push({ url: item.url, error: e.message });
      }
    }

    return success(res, results, `Synced ${results.synced} items`);
  } catch (err) {
    logger.error({ err }, 'Sync offline error');
    throw err;
  }
}

// ─── WATER INTAKE ─────────────────────────────────────────────────────────────
async function logWater(req, res) {
  try {
    const { ml, date } = req.body;
    const userId = req.user.id;
    const dateOnly = new Date(date || Date.now());
    dateOnly.setHours(0, 0, 0, 0);

    const summary = await prisma.dailySummary.upsert({
      where: { user_id_date: { user_id: userId, date: dateOnly } },
      create: { user_id: userId, date: dateOnly, water_ml: ml },
      update: { water_ml: { increment: ml } },
    });

    return success(res, { water_ml: summary.water_ml, date: dateOnly }, 'Water logged');
  } catch (err) {
    logger.error({ err }, 'Log water error');
    throw err;
  }
}

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
async function healthCheck(req, res) {
  const prismaOk = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
  return success(res, {
    status: prismaOk ? 'healthy' : 'degraded',
    version: '1.0.0',
    db: prismaOk ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
    uptime_s: Math.floor(process.uptime()),
  });
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function pct(actual, target) {
  if (!target) return 0;
  return Math.round((actual / target) * 100);
}

function avg(arr, key) {
  const vals = arr.map(x => x[key]).filter(Boolean);
  if (!vals.length) return null;
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
}

module.exports = { getDailySummary, getWeeklySummary, logMood, getMoodHistory, syncOffline, logWater, healthCheck };
