// src/controllers/nutrition.controller.js
// Phase 1B — Full 18-nutrient tracking, barcode lookup, weekly progress
'use strict';

const prisma = require('../config/db');
const { success, notFound } = require('../utils/response');
const logger = require('../utils/logger');

// ── ALL 18 TRACKED NUTRIENTS (per goals) ────────────────────────────────────
const MICRONUTRIENT_GOALS = {
  // Macro
  calories:        { label: 'Calories',      unit: 'kcal', rda: 2000 },
  protein_g:       { label: 'Protein',       unit: 'g',    rda: 50   },
  carbs_g:         { label: 'Carbs',         unit: 'g',    rda: 275  },
  fats_g:          { label: 'Fats',          unit: 'g',    rda: 78   },
  fiber_g:         { label: 'Fiber',         unit: 'g',    rda: 25   },
  sugar_g:         { label: 'Sugar',         unit: 'g',    rda: 50   },  // limit
  // Minerals
  sodium_mg:       { label: 'Sodium',        unit: 'mg',   rda: 2300, limit: true },
  potassium_mg:    { label: 'Potassium',     unit: 'mg',   rda: 4700 },
  calcium_mg:      { label: 'Calcium',       unit: 'mg',   rda: 1000 },
  iron_mg:         { label: 'Iron',          unit: 'mg',   rda: 18   },
  zinc_mg:         { label: 'Zinc',          unit: 'mg',   rda: 11   },
  magnesium_mg:    { label: 'Magnesium',     unit: 'mg',   rda: 420  },
  phosphorus_mg:   { label: 'Phosphorus',    unit: 'mg',   rda: 700  },
  // Vitamins
  vitamin_c_mg:    { label: 'Vitamin C',     unit: 'mg',   rda: 90   },
  vitamin_d_mcg:   { label: 'Vitamin D',     unit: 'mcg',  rda: 20   },
  vitamin_b12_mcg: { label: 'Vitamin B12',   unit: 'mcg',  rda: 2.4  },
  folate_mcg:      { label: 'Folate',        unit: 'mcg',  rda: 400  },
  cholesterol_mg:  { label: 'Cholesterol',   unit: 'mg',   rda: 300, limit: true },
};

// ── FULL DAILY NUTRIENT BREAKDOWN ────────────────────────────────────────────
async function getDailyNutrients(req, res) {
  try {
    const { date } = req.query;
    const userId    = req.user.id;
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    const [mealItems, goals] = await Promise.all([
      prisma.mealItem.findMany({
        where:   { user_id: userId, date: targetDate },
        include: { food: true },
      }),
      prisma.userGoal.findFirst({
        where: { user_id: userId, is_active: true },
        orderBy: { created_at: 'desc' },
      }),
    ]);

    // Aggregate all nutrients from food records
    const totals = {};
    for (const key of Object.keys(MICRONUTRIENT_GOALS)) {
      totals[key] = 0;
    }

    for (const item of mealItems) {
      const f = item.food;
      if (!f) continue;
      const r = item.quantity_raw / 100;

      totals.calories        += (f.calories        || 0) * r;
      totals.protein_g       += (f.protein_g       || 0) * r;
      totals.carbs_g         += (f.carbs_g         || 0) * r;
      totals.fats_g          += (f.fats_g          || 0) * r;
      totals.fiber_g         += (f.fiber_g         || 0) * r;
      totals.sugar_g         += (f.sugar_g         || 0) * r;
      totals.sodium_mg       += (f.sodium_mg       || 0) * r;
      totals.potassium_mg    += (f.potassium_mg    || 0) * r;
      totals.calcium_mg      += (f.calcium_mg      || 0) * r;
      totals.iron_mg         += (f.iron_mg         || 0) * r;
      totals.zinc_mg         += (f.zinc_mg         || 0) * r;
      totals.magnesium_mg    += (f.magnesium_mg    || 0) * r;
      totals.phosphorus_mg   += (f.phosphorus_mg   || 0) * r;
      totals.vitamin_c_mg    += (f.vitamin_c_mg    || 0) * r;
      totals.vitamin_d_mcg   += (f.vitamin_d_mcg   || 0) * r;
      totals.vitamin_b12_mcg += (f.vitamin_b12_mcg || 0) * r;
      totals.folate_mcg      += (f.folate_mcg      || 0) * r;
      totals.cholesterol_mg  += (f.cholesterol_mg  || 0) * r;
    }

    // Round all values to 1dp
    for (const k of Object.keys(totals)) {
      totals[k] = Math.round(totals[k] * 10) / 10;
    }

    // Build progress vs RDA and vs user goals
    const nutrientStatus = {};
    for (const [key, meta] of Object.entries(MICRONUTRIENT_GOALS)) {
      const actual = totals[key] || 0;
      let rda = meta.rda;

      // Override with user goals for macros
      if (goals) {
        if (key === 'calories') rda = goals.target_calories;
        if (key === 'protein_g') rda = goals.target_protein_g;
        if (key === 'carbs_g')   rda = goals.target_carbs_g;
        if (key === 'fats_g')    rda = goals.target_fats_g;
        if (key === 'fiber_g')   rda = goals.target_fiber_g || 25;
      }

      const pct = Math.round((actual / rda) * 100);
      let status = 'good';
      if (meta.limit) {
        status = pct > 100 ? 'danger' : pct > 80 ? 'warning' : 'good';
      } else {
        status = pct < 50 ? 'low' : pct < 80 ? 'warning' : 'good';
      }

      nutrientStatus[key] = {
        label:  meta.label,
        unit:   meta.unit,
        actual: actual,
        rda:    rda,
        pct:    pct,
        status: status,
        is_limit: meta.limit || false,
      };
    }

    // Generate food recommendations for deficient nutrients
    const recommendations = await generateRecommendations(nutrientStatus);

    return success(res, {
      date:            targetDate.toISOString().split('T')[0],
      totals,
      nutrient_status: nutrientStatus,
      recommendations,
      meal_count:      mealItems.length,
    });
  } catch (err) {
    logger.error({ err }, 'Get daily nutrients error');
    throw err;
  }
}

// ── WEEKLY NUTRITION TREND ───────────────────────────────────────────────────
async function getWeeklyNutrition(req, res) {
  try {
    const userId = req.user.id;
    const days   = parseInt(req.query.days) || 7;

    const endDate   = new Date(); endDate.setHours(23, 59, 59, 999);
    const startDate = new Date(); startDate.setDate(endDate.getDate() - (days - 1)); startDate.setHours(0, 0, 0, 0);

    const summaries = await prisma.dailySummary.findMany({
      where:   { user_id: userId, date: { gte: startDate, lte: endDate } },
      orderBy: { date: 'asc' },
    });

    const goals = await prisma.userGoal.findFirst({
      where: { user_id: userId, is_active: true },
    });

    // Fill missing days with zeros
    const result = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const found   = summaries.find(s => s.date.toISOString().split('T')[0] === dateStr);
      result.push({
        date:     dateStr,
        calories: found?.total_calories_consumed || 0,
        protein:  found?.total_protein_g         || 0,
        carbs:    found?.total_carbs_g            || 0,
        fats:     found?.total_fats_g             || 0,
        burned:   found?.total_calories_burned    || 0,
        net:      found ? found.total_calories_consumed - found.total_calories_burned : 0,
      });
    }

    const avgCalories = result.reduce((s, d) => s + d.calories, 0) / days;
    const avgProtein  = result.reduce((s, d) => s + d.protein,  0) / days;
    const goalDays    = goals ? result.filter(d => d.protein >= goals.target_protein_g * 0.9).length : 0;

    return success(res, {
      days: result,
      averages: {
        calories: Math.round(avgCalories),
        protein:  Math.round(avgProtein * 10) / 10,
      },
      protein_goal_days: goalDays,
      goals,
    });
  } catch (err) {
    logger.error({ err }, 'Get weekly nutrition error');
    throw err;
  }
}

// ── TOP FOODS EATEN ──────────────────────────────────────────────────────────
async function getTopFoods(req, res) {
  try {
    const userId = req.user.id;
    const days   = parseInt(req.query.days) || 30;

    const since = new Date();
    since.setDate(since.getDate() - days);

    const items = await prisma.mealItem.findMany({
      where:   { user_id: userId, date: { gte: since } },
      include: { food: { select: { id: true, name: true, category: true, calories: true, protein_g: true } } },
    });

    // Aggregate by food
    const foodMap = {};
    for (const item of items) {
      if (!item.food) continue;
      const id = item.food_id;
      if (!foodMap[id]) {
        foodMap[id] = { food: item.food, count: 0, total_calories: 0, total_protein: 0, total_grams: 0 };
      }
      foodMap[id].count++;
      foodMap[id].total_calories += item.calories;
      foodMap[id].total_protein  += item.protein_g;
      foodMap[id].total_grams    += item.quantity_raw;
    }

    const sorted = Object.values(foodMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return success(res, { top_foods: sorted, period_days: days });
  } catch (err) {
    logger.error({ err }, 'Get top foods error');
    throw err;
  }
}

// ── NUTRITION HISTORY (per food item) ───────────────────────────────────────
async function getNutritionHistory(req, res) {
  try {
    const { start_date, end_date, meal_type, page = 1, limit = 30 } = req.query;
    const userId = req.user.id;
    const where  = { user_id: userId };

    if (start_date) where.date = { gte: new Date(start_date) };
    if (end_date)   where.date = { ...where.date, lte: new Date(end_date) };
    if (meal_type)  where.meal_type = meal_type;

    const [items, total] = await Promise.all([
      prisma.mealItem.findMany({
        where,
        include: { food: { select: { id: true, name: true, category: true } } },
        orderBy: { date: 'desc' },
        skip:    (page - 1) * limit,
        take:    parseInt(limit),
      }),
      prisma.mealItem.count({ where }),
    ]);

    return success(res, { items, total, page: parseInt(page) });
  } catch (err) {
    logger.error({ err }, 'Get nutrition history error');
    throw err;
  }
}

// ── FOOD COMPARISON (two foods side by side) ─────────────────────────────────
async function compareFoods(req, res) {
  try {
    const { food_a, food_b } = req.query;
    if (!food_a || !food_b) return res.status(400).json({ success: false, message: 'food_a and food_b required' });

    const [a, b] = await Promise.all([
      prisma.food.findUnique({ where: { id: food_a } }),
      prisma.food.findUnique({ where: { id: food_b } }),
    ]);

    if (!a || !b) return notFound(res, 'One or both foods not found');

    const keys = ['calories', 'protein_g', 'carbs_g', 'fats_g', 'fiber_g', 'calcium_mg', 'iron_mg', 'vitamin_c_mg'];
    const comparison = keys.map(k => ({
      nutrient: k,
      a: a[k] || 0,
      b: b[k] || 0,
      winner: (a[k] || 0) >= (b[k] || 0) ? 'a' : 'b',
    }));

    return success(res, { food_a: a, food_b: b, comparison });
  } catch (err) {
    logger.error({ err }, 'Compare foods error');
    throw err;
  }
}

// ── INTERNAL: Generate food recommendations ───────────────────────────────────
async function generateRecommendations(nutrientStatus) {
  const recs = [];
  const LOW_THRESHOLD = 60;

  const foodSuggestions = {
    protein_g:       ['Add 150g chicken breast (+47g protein)', 'Include 100g paneer (+18g protein)', '2 boiled eggs (+13g protein)'],
    iron_mg:         ['Add 100g spinach (+2.7mg iron)', '50g sesame seeds (+7mg iron)', '100g masoor dal (+7.6mg iron)'],
    calcium_mg:      ['200ml milk (+240mg calcium)', '100g paneer (+480mg calcium)', '30g sesame seeds (+290mg calcium)'],
    vitamin_c_mg:    ['1 orange (+53mg Vit C)', '50g guava (+114mg Vit C)', '50g capsicum (+64mg Vit C)'],
    fiber_g:         ['Add 30g oats (+3g fiber)', '100g rajma (+25g fiber)', 'Include green salad'],
    vitamin_d_mcg:   ['Get 15 min morning sunlight', '100g salmon (+11mcg Vit D)', 'Consider a supplement'],
    vitamin_b12_mcg: ['100g chicken (+0.3mcg B12)', '1 egg (+0.9mcg B12)', '200ml milk (+0.9mcg B12)'],
    zinc_mg:         ['30g pumpkin seeds (+4mg zinc)', '100g chickpeas (+1.5mg zinc)', '100g beef (+4mg zinc)'],
    potassium_mg:    ['1 banana (+422mg potassium)', '100g potato (+421mg)', '100g spinach (+558mg)'],
  };

  for (const [key, status] of Object.entries(nutrientStatus)) {
    if (!status.is_limit && status.pct < LOW_THRESHOLD && foodSuggestions[key]) {
      recs.push({
        nutrient: status.label,
        pct: status.pct,
        suggestions: foodSuggestions[key],
      });
    }
  }

  return recs.sort((a, b) => a.pct - b.pct).slice(0, 4);
}

module.exports = { getDailyNutrients, getWeeklyNutrition, getTopFoods, getNutritionHistory, compareFoods };
