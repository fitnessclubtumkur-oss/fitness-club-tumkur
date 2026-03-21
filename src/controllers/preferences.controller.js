// src/controllers/preferences.controller.js
// Phase 2C — Meal Preferences: allergies, dietary, dislikes + weight history + wearables
'use strict';

const prisma = require('../config/db');
const { success, created, error, notFound } = require('../utils/response');
const logger = require('../utils/logger');

// ─── USER PREFERENCES (stored in fitness_profiles as JSON) ───────────────────
// We store preferences in a new field; schema handles this via the existing
// fitness_profiles table extended with a preferences JSON column

// ── GET PREFERENCES ──────────────────────────────────────────────────────────
async function getPreferences(req, res) {
  try {
    const userId = req.user.id;
    let prefs = await prisma.userPreferences.findUnique({ where: { user_id: userId } });
    if (!prefs) {
      // Return defaults
      prefs = {
        user_id:    userId,
        allergies:  [],
        dietary:    [],
        dislikes:   [],
        created_at: new Date(),
        updated_at: new Date(),
      };
    }
    return success(res, { preferences: prefs });
  } catch (err) {
    logger.error({ err }, 'Get preferences error');
    throw err;
  }
}

// ── SAVE ALLERGIES ─────────────────────────────────────────────────────────────
async function saveAllergies(req, res) {
  try {
    const { allergies } = req.body; // e.g. ['PEANUTS', 'DAIRY', 'GLUTEN']
    const userId = req.user.id;

    const prefs = await prisma.userPreferences.upsert({
      where:  { user_id: userId },
      create: { user_id: userId, allergies, dietary: [], dislikes: [] },
      update: { allergies },
    });

    return success(res, { preferences: prefs }, 'Allergies saved');
  } catch (err) {
    logger.error({ err }, 'Save allergies error');
    throw err;
  }
}

// ── SAVE DIETARY PREFERENCES ───────────────────────────────────────────────────
async function saveDietary(req, res) {
  try {
    const { dietary } = req.body; // e.g. ['VEGETARIAN', 'KETO']
    const userId = req.user.id;

    const prefs = await prisma.userPreferences.upsert({
      where:  { user_id: userId },
      create: { user_id: userId, dietary, allergies: [], dislikes: [] },
      update: { dietary },
    });

    return success(res, { preferences: prefs }, 'Dietary preferences saved');
  } catch (err) {
    logger.error({ err }, 'Save dietary error');
    throw err;
  }
}

// ── SAVE DISLIKES ──────────────────────────────────────────────────────────────
async function saveDislikes(req, res) {
  try {
    const { dislikes } = req.body; // e.g. ['mushrooms', 'cilantro']
    const userId = req.user.id;

    const prefs = await prisma.userPreferences.upsert({
      where:  { user_id: userId },
      create: { user_id: userId, dislikes, allergies: [], dietary: [] },
      update: { dislikes },
    });

    return success(res, { preferences: prefs }, 'Dislikes saved');
  } catch (err) {
    logger.error({ err }, 'Save dislikes error');
    throw err;
  }
}

// ── GET CUSTOMISED KITCHEN MEALS (filtered by preferences) ────────────────────
async function getCustomisedMeals(req, res) {
  try {
    const userId = req.user.id;
    const { category } = req.query;

    const prefs = await prisma.userPreferences.findUnique({ where: { user_id: userId } });

    const where = { is_active: true };
    if (category) where.category = category.toUpperCase();

    // Apply vegetarian filter
    if (prefs && prefs.dietary && prefs.dietary.includes('VEGETARIAN')) {
      where.is_vegetarian = true;
    }
    if (prefs && prefs.dietary && prefs.dietary.includes('VEGAN')) {
      where.is_vegan = true;
    }

    const meals = await prisma.kitchenMeal.findMany({
      where,
      orderBy: [{ category: 'asc' }, { avg_rating: 'desc' }],
    });

    // Filter out allergen meals client-side
    const allergies = (prefs && prefs.allergies) || [];
    const filtered = meals.filter(m => {
      if (!allergies.length) return true;
      const mealAllergens = (m.allergens || []);
      return !allergies.some(a => mealAllergens.includes(a));
    });

    // Add customisation flags
    const result = filtered.map(m => ({
      ...m,
      customised: false,
      substitutions: [],
    }));

    return success(res, {
      meals:       result,
      total:       result.length,
      preferences: prefs || null,
      filters_applied: {
        vegetarian: prefs && prefs.dietary && prefs.dietary.includes('VEGETARIAN'),
        vegan:      prefs && prefs.dietary && prefs.dietary.includes('VEGAN'),
        allergens:  allergies,
      },
    });
  } catch (err) {
    logger.error({ err }, 'Get customised meals error');
    throw err;
  }
}

// ─── WEIGHT HISTORY ────────────────────────────────────────────────────────────
async function logWeight(req, res) {
  try {
    const { weight_kg, date, notes } = req.body;
    const userId = req.user.id;

    // Update fitness profile with latest weight
    await prisma.fitnessProfile.update({
      where: { user_id: userId },
      data:  { weight_kg },
    }).catch(() => {});

    // Log to weight history
    const entry = await prisma.weightHistory.create({
      data: {
        user_id:   userId,
        weight_kg,
        date:      date ? new Date(date) : new Date(),
        notes:     notes || null,
      },
    });

    // Recalculate TDEE with new weight
    const profile = await prisma.fitnessProfile.findUnique({ where: { user_id: userId } });
    let tdee = null;
    if (profile) {
      const { calculateTDEE } = require('../utils/calc');
      tdee = calculateTDEE(profile.gender, weight_kg, profile.height_cm, profile.age, profile.activity_level);
    }

    return created(res, { entry, updated_tdee: tdee }, `Weight logged: ${weight_kg}kg`);
  } catch (err) {
    logger.error({ err }, 'Log weight error');
    throw err;
  }
}

async function getWeightHistory(req, res) {
  try {
    const { days = 90 } = req.query;
    const userId  = req.user.id;
    const since   = new Date(Date.now() - parseInt(days) * 86400000);

    const history = await prisma.weightHistory.findMany({
      where:   { user_id: userId, date: { gte: since } },
      orderBy: { date: 'asc' },
    });

    // Calculate stats
    const profile = await prisma.fitnessProfile.findUnique({
      where:  { user_id: userId },
      select: { weight_kg: true },
    });

    const stats = history.length >= 2 ? {
      start_weight: history[0].weight_kg,
      current_weight: history[history.length - 1].weight_kg,
      change_kg: +(history[history.length - 1].weight_kg - history[0].weight_kg).toFixed(1),
      min_kg: Math.min(...history.map(h => h.weight_kg)),
      max_kg: Math.max(...history.map(h => h.weight_kg)),
      avg_kg: +(history.reduce((s, h) => s + h.weight_kg, 0) / history.length).toFixed(1),
    } : null;

    return success(res, {
      history,
      stats,
      current_weight: profile ? profile.weight_kg : null,
      period_days:    parseInt(days),
    });
  } catch (err) {
    logger.error({ err }, 'Get weight history error');
    throw err;
  }
}

// ─── BODY MEASUREMENTS ────────────────────────────────────────────────────────
async function logMeasurements(req, res) {
  try {
    const { chest_cm, waist_cm, hips_cm, arms_cm, thighs_cm, body_fat_pct, date } = req.body;
    const userId = req.user.id;

    const entry = await prisma.bodyMeasurement.create({
      data: {
        user_id:      userId,
        chest_cm:     chest_cm     || null,
        waist_cm:     waist_cm     || null,
        hips_cm:      hips_cm      || null,
        arms_cm:      arms_cm      || null,
        thighs_cm:    thighs_cm    || null,
        body_fat_pct: body_fat_pct || null,
        date:         date ? new Date(date) : new Date(),
      },
    });

    // Update body_fat_pct in fitness profile if provided
    if (body_fat_pct) {
      await prisma.fitnessProfile.update({
        where: { user_id: userId },
        data:  { body_fat_pct },
      }).catch(() => {});
    }

    return created(res, { entry }, 'Measurements logged');
  } catch (err) {
    logger.error({ err }, 'Log measurements error');
    throw err;
  }
}

async function getMeasurements(req, res) {
  try {
    const { days = 90 } = req.query;
    const userId = req.user.id;
    const since  = new Date(Date.now() - parseInt(days) * 86400000);

    const measurements = await prisma.bodyMeasurement.findMany({
      where:   { user_id: userId, date: { gte: since } },
      orderBy: { date: 'asc' },
    });

    const latest = measurements[measurements.length - 1] || null;
    const first  = measurements[0] || null;

    let changes = null;
    if (latest && first && measurements.length >= 2) {
      changes = {
        waist_cm:  first.waist_cm  && latest.waist_cm  ? +(latest.waist_cm  - first.waist_cm).toFixed(1)  : null,
        chest_cm:  first.chest_cm  && latest.chest_cm  ? +(latest.chest_cm  - first.chest_cm).toFixed(1)  : null,
        body_fat_pct: first.body_fat_pct && latest.body_fat_pct ? +(latest.body_fat_pct - first.body_fat_pct).toFixed(1) : null,
      };
    }

    return success(res, { measurements, latest, changes });
  } catch (err) {
    logger.error({ err }, 'Get measurements error');
    throw err;
  }
}

// ─── SUBSCRIPTION MANAGEMENT (UI-layer, backend already exists) ───────────────
async function getSubscriptionDetails(req, res) {
  try {
    const sub = await prisma.subscription.findFirst({
      where:   { id: req.params.id, user_id: req.user.id },
    });
    if (!sub) return notFound(res, 'Subscription not found');

    // Calculate next billing date
    const now = new Date();
    const isActive = sub.status === 'ACTIVE';
    const isPaused = sub.status === 'PAUSED';
    const daysUntilBilling = isActive
      ? Math.max(0, Math.ceil((sub.next_billing_date - now) / 86400000))
      : null;

    return success(res, {
      subscription: sub,
      days_until_billing: daysUntilBilling,
      can_pause:  isActive,
      can_resume: isPaused,
      can_cancel: isActive || isPaused,
    });
  } catch (err) {
    logger.error({ err }, 'Get subscription details error');
    throw err;
  }
}

async function skipDelivery(req, res) {
  try {
    const { date, meal_type } = req.body;
    const sub = await prisma.subscription.findFirst({
      where: { id: req.params.id, user_id: req.user.id, status: 'ACTIVE' },
    });
    if (!sub) return notFound(res, 'Active subscription not found');

    const skipped = Array.isArray(sub.skipped_deliveries) ? sub.skipped_deliveries : [];
    skipped.push({ date, meal_type: meal_type || 'all' });

    await prisma.subscription.update({
      where: { id: sub.id },
      data:  { skipped_deliveries: skipped },
    });

    return success(res, { skipped_count: skipped.length }, `Delivery on ${date} skipped`);
  } catch (err) {
    logger.error({ err }, 'Skip delivery error');
    throw err;
  }
}

async function changeMealsPerDay(req, res) {
  try {
    const { meals_per_day } = req.body;
    const sub = await prisma.subscription.findFirst({
      where: { id: req.params.id, user_id: req.user.id, status: { in: ['ACTIVE', 'PAUSED'] } },
    });
    if (!sub) return notFound(res, 'Subscription not found');

    // Recalculate price proportionally
    const basePrice   = sub.price_inr / sub.meals_per_day;
    const newPrice    = +(basePrice * meals_per_day).toFixed(2);

    const updated = await prisma.subscription.update({
      where: { id: sub.id },
      data:  { meals_per_day, price_inr: newPrice },
    });

    return success(res, { subscription: updated }, `Changed to ${meals_per_day} meals/day — ₹${newPrice}`);
  } catch (err) {
    logger.error({ err }, 'Change meals per day error');
    throw err;
  }
}

// ─── PROGRESS ANALYTICS ───────────────────────────────────────────────────────
async function getProgressSummary(req, res) {
  try {
    const userId = req.user.id;
    const { period = '30' } = req.query;
    const days  = parseInt(period);
    const since = new Date(Date.now() - days * 86400000);

    const [workouts, summaries, weightHistory, achievements] = await Promise.all([
      prisma.workout.findMany({ where: { user_id: userId, date: { gte: since } } }),
      prisma.dailySummary.findMany({ where: { user_id: userId, date: { gte: since } } }),
      prisma.weightHistory.findMany({ where: { user_id: userId, date: { gte: since } }, orderBy: { date: 'asc' } }),
      prisma.userAchievement.findMany({
        where:   { user_id: userId, earned_at: { gte: since } },
        include: { achievement: { select: { name: true, points: true } } },
      }),
    ]);

    const goals = await prisma.userGoal.findFirst({ where: { user_id: userId, is_active: true } });

    const totalWorkouts     = workouts.length;
    const totalCalBurned    = workouts.reduce((s, w) => s + w.calories_burned, 0);
    const totalRunKm        = workouts.filter(w => w.type === 'RUNNING').reduce((s, w) => s + ((w.metadata && w.metadata.distance_km) || 0), 0);
    const avgCaloriesIn     = summaries.length ? summaries.reduce((s, d) => s + d.total_calories_consumed, 0) / summaries.length : 0;
    const avgProtein        = summaries.length ? summaries.reduce((s, d) => s + d.total_protein_g, 0) / summaries.length : 0;
    const proteinGoalDays   = goals ? summaries.filter(d => d.total_protein_g >= goals.target_protein_g * 0.9).length : 0;
    const weightChange      = weightHistory.length >= 2 ? +(weightHistory[weightHistory.length - 1].weight_kg - weightHistory[0].weight_kg).toFixed(1) : null;
    const newBadges         = achievements.length;
    const pointsEarned      = achievements.reduce((s, a) => s + ((a.achievement && a.achievement.points) || 0), 0);

    // Best workout type
    const byType = workouts.reduce((a, w) => { a[w.type] = (a[w.type] || 0) + 1; return a; }, {});
    const bestType = Object.entries(byType).sort((a, b) => b[1] - a[1])[0];

    // Consistency score (0-100)
    const activeDays   = new Set(workouts.map(w => w.date && w.date.toISOString().split('T')[0])).size;
    const consistency  = Math.round((activeDays / days) * 100);

    return success(res, {
      period_days:     days,
      workouts: {
        total:         totalWorkouts,
        active_days:   activeDays,
        calories_burned: Math.round(totalCalBurned),
        run_km:        +totalRunKm.toFixed(1),
        best_type:     bestType ? bestType[0] : null,
        consistency_pct: consistency,
      },
      nutrition: {
        avg_calories:    Math.round(avgCaloriesIn),
        avg_protein_g:   +avgProtein.toFixed(1),
        protein_goal_days: proteinGoalDays,
        tracking_days:   summaries.length,
        goal_calories:   goals ? goals.target_calories : null,
        goal_protein_g:  goals ? goals.target_protein_g : null,
      },
      body: {
        weight_change_kg: weightChange,
        weight_entries:   weightHistory.length,
      },
      achievements: {
        new_badges:    newBadges,
        points_earned: pointsEarned,
        recent:        achievements.slice(0, 3).map(a => a.achievement && a.achievement.name),
      },
    });
  } catch (err) {
    logger.error({ err }, 'Get progress summary error');
    throw err;
  }
}

module.exports = {
  getPreferences, saveAllergies, saveDietary, saveDislikes, getCustomisedMeals,
  logWeight, getWeightHistory,
  logMeasurements, getMeasurements,
  getSubscriptionDetails, skipDelivery, changeMealsPerDay,
  getProgressSummary,
};
