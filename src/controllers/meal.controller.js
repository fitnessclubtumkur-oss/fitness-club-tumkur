// src/controllers/meal.controller.js
'use strict';

const prisma = require('../config/db');
const { calculateFoodNutrition } = require('../utils/calc');
const { success, created, error, notFound } = require('../utils/response');
const logger = require('../utils/logger');

// Helper: update daily summary with nutrition delta
async function updateDailySummaryNutrition(userId, date, nutrition, increment = true) {
  const dateOnly = new Date(date);
  dateOnly.setHours(0, 0, 0, 0);
  const sign = increment ? 1 : -1;

  await prisma.dailySummary.upsert({
    where: { user_id_date: { user_id: userId, date: dateOnly } },
    create: {
      user_id: userId,
      date: dateOnly,
      total_calories_consumed: Math.max(0, nutrition.calories * sign),
      total_protein_g:  Math.max(0, nutrition.protein_g  * sign),
      total_carbs_g:    Math.max(0, nutrition.carbs_g    * sign),
      total_fats_g:     Math.max(0, nutrition.fats_g     * sign),
      total_fiber_g:    Math.max(0, nutrition.fiber_g    * sign),
      total_calcium_mg: Math.max(0, nutrition.calcium_mg * sign),
      total_iron_mg:    Math.max(0, nutrition.iron_mg    * sign),
      total_vitamin_c_mg: Math.max(0, nutrition.vitamin_c_mg * sign),
      total_zinc_mg:    Math.max(0, nutrition.zinc_mg    * sign),
    },
    update: {
      total_calories_consumed: { increment: nutrition.calories  * sign },
      total_protein_g:         { increment: nutrition.protein_g * sign },
      total_carbs_g:           { increment: nutrition.carbs_g   * sign },
      total_fats_g:            { increment: nutrition.fats_g    * sign },
      total_fiber_g:           { increment: nutrition.fiber_g   * sign },
      total_calcium_mg:        { increment: nutrition.calcium_mg * sign },
      total_iron_mg:           { increment: nutrition.iron_mg    * sign },
      total_vitamin_c_mg:      { increment: nutrition.vitamin_c_mg * sign },
      total_zinc_mg:           { increment: nutrition.zinc_mg   * sign },
    },
  });

  // Recalculate net calories
  await prisma.$executeRaw`
    UPDATE daily_summaries
    SET net_calories = total_calories_consumed - total_calories_burned
    WHERE user_id = ${userId}
    AND date = ${dateOnly}
  `;
}

// ─── SEARCH FOODS ──────────────────────────────────────────────────────────────
async function searchFoods(req, res) {
  try {
    const { q, category, page = 1, limit = 20 } = req.query;

    const where = { is_active: true };
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { name_kannada: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (category) where.category = category;

    const [foods, total] = await Promise.all([
      prisma.food.findMany({
        where,
        select: {
          id: true, name: true, name_kannada: true, category: true,
          calories: true, protein_g: true, carbs_g: true, fats_g: true,
          fiber_g: true, default_unit: true, barcode: true,
        },
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: parseInt(limit),
      }),
      prisma.food.count({ where }),
    ]);

    return success(res, { foods, total, page: parseInt(page) });
  } catch (err) {
    logger.error({ err }, 'Search foods error');
    throw err;
  }
}

// ─── GET FOOD BY BARCODE ──────────────────────────────────────────────────────
async function getFoodByBarcode(req, res) {
  try {
    const { barcode } = req.params;
    const food = await prisma.food.findUnique({ where: { barcode } });
    if (!food) return notFound(res, 'Food not found for this barcode');
    return success(res, { food });
  } catch (err) {
    logger.error({ err }, 'Get food by barcode error');
    throw err;
  }
}

// ─── GET FOOD BY ID ──────────────────────────────────────────────────────────
async function getFood(req, res) {
  try {
    const food = await prisma.food.findUnique({ where: { id: req.params.id } });
    if (!food) return notFound(res);
    return success(res, { food });
  } catch (err) {
    logger.error({ err }, 'Get food error');
    throw err;
  }
}

// ─── LOG MEAL ITEM ────────────────────────────────────────────────────────────
async function logMealItem(req, res) {
  try {
    const { food_id, meal_type, date, quantity_raw, unit = 'GRAMS' } = req.body;
    const userId = req.user.id;

    const food = await prisma.food.findUnique({ where: { id: food_id } });
    if (!food) return notFound(res, 'Food not found');

    const nutrition = calculateFoodNutrition(food, quantity_raw);

    const mealItem = await prisma.mealItem.create({
      data: {
        user_id: userId,
        food_id,
        meal_type,
        date: new Date(date),
        quantity_raw,
        unit,
        calories:  nutrition.calories,
        protein_g: nutrition.protein_g,
        carbs_g:   nutrition.carbs_g,
        fats_g:    nutrition.fats_g,
        fiber_g:   nutrition.fiber_g,
      },
      include: { food: { select: { name: true, category: true } } },
    });

    await updateDailySummaryNutrition(userId, date, nutrition, true);

    return created(res, { meal_item: mealItem, nutrition }, 'Meal logged');
  } catch (err) {
    logger.error({ err }, 'Log meal item error');
    throw err;
  }
}

// ─── LOG MULTIPLE MEAL ITEMS (bulk) ──────────────────────────────────────────
async function logMealItems(req, res) {
  try {
    const { items, meal_type, date } = req.body;
    // items: [{ food_id, quantity_raw, unit }]
    const userId = req.user.id;

    const results = [];
    let totalNutrition = { calories: 0, protein_g: 0, carbs_g: 0, fats_g: 0, fiber_g: 0, sodium_mg: 0, calcium_mg: 0, iron_mg: 0, vitamin_c_mg: 0, zinc_mg: 0 };

    for (const item of items) {
      const food = await prisma.food.findUnique({ where: { id: item.food_id } });
      if (!food) continue;

      const nutrition = calculateFoodNutrition(food, item.quantity_raw);
      for (const key of Object.keys(totalNutrition)) {
        totalNutrition[key] = (totalNutrition[key] || 0) + (nutrition[key] || 0);
      }

      const mealItem = await prisma.mealItem.create({
        data: {
          user_id: userId,
          food_id: item.food_id,
          meal_type,
          date: new Date(date),
          quantity_raw: item.quantity_raw,
          unit: item.unit || 'GRAMS',
          calories:  nutrition.calories,
          protein_g: nutrition.protein_g,
          carbs_g:   nutrition.carbs_g,
          fats_g:    nutrition.fats_g,
          fiber_g:   nutrition.fiber_g,
        },
        include: { food: { select: { name: true } } },
      });
      results.push(mealItem);
    }

    if (results.length > 0) {
      await updateDailySummaryNutrition(userId, date, totalNutrition, true);
    }

    return created(res, { meal_items: results, total_nutrition: totalNutrition }, `${results.length} items logged`);
  } catch (err) {
    logger.error({ err }, 'Log bulk meal items error');
    throw err;
  }
}

// ─── GET MEAL ITEMS (by date) ─────────────────────────────────────────────────
async function getMealItems(req, res) {
  try {
    const { date, meal_type } = req.query;
    const userId = req.user.id;

    const where = { user_id: userId };
    if (date) where.date = new Date(date);
    if (meal_type) where.meal_type = meal_type;

    const items = await prisma.mealItem.findMany({
      where,
      include: {
        food: {
          select: { id: true, name: true, name_kannada: true, category: true, calories: true, protein_g: true, carbs_g: true, fats_g: true }
        },
      },
      orderBy: [{ date: 'desc' }, { created_at: 'asc' }],
    });

    // Group by meal_type
    const grouped = items.reduce((acc, item) => {
      if (!acc[item.meal_type]) acc[item.meal_type] = [];
      acc[item.meal_type].push(item);
      return acc;
    }, {});

    return success(res, { items, grouped });
  } catch (err) {
    logger.error({ err }, 'Get meal items error');
    throw err;
  }
}

// ─── UPDATE MEAL ITEM ─────────────────────────────────────────────────────────
async function updateMealItem(req, res) {
  try {
    const { id } = req.params;
    const { quantity_raw } = req.body;
    const userId = req.user.id;

    const existing = await prisma.mealItem.findFirst({
      where: { id, user_id: userId },
      include: { food: true },
    });
    if (!existing) return notFound(res, 'Meal item not found');

    const oldNutrition = calculateFoodNutrition(existing.food, existing.quantity_raw);
    const newNutrition = calculateFoodNutrition(existing.food, quantity_raw);

    const updated = await prisma.mealItem.update({
      where: { id },
      data: {
        quantity_raw,
        calories:  newNutrition.calories,
        protein_g: newNutrition.protein_g,
        carbs_g:   newNutrition.carbs_g,
        fats_g:    newNutrition.fats_g,
        fiber_g:   newNutrition.fiber_g,
      },
    });

    // Update daily summary: remove old, add new
    const delta = {
      calories:    newNutrition.calories  - oldNutrition.calories,
      protein_g:   newNutrition.protein_g - oldNutrition.protein_g,
      carbs_g:     newNutrition.carbs_g   - oldNutrition.carbs_g,
      fats_g:      newNutrition.fats_g    - oldNutrition.fats_g,
      fiber_g:     newNutrition.fiber_g   - oldNutrition.fiber_g,
      calcium_mg:  newNutrition.calcium_mg - oldNutrition.calcium_mg,
      iron_mg:     newNutrition.iron_mg   - oldNutrition.iron_mg,
      vitamin_c_mg: newNutrition.vitamin_c_mg - oldNutrition.vitamin_c_mg,
      zinc_mg:     newNutrition.zinc_mg   - oldNutrition.zinc_mg,
    };

    await updateDailySummaryNutrition(userId, existing.date, delta, true);

    return success(res, { meal_item: updated, new_nutrition: newNutrition }, 'Meal item updated');
  } catch (err) {
    logger.error({ err }, 'Update meal item error');
    throw err;
  }
}

// ─── DELETE MEAL ITEM ─────────────────────────────────────────────────────────
async function deleteMealItem(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const item = await prisma.mealItem.findFirst({
      where: { id, user_id: userId },
      include: { food: true },
    });
    if (!item) return notFound(res, 'Meal item not found');

    const nutrition = calculateFoodNutrition(item.food, item.quantity_raw);
    await prisma.mealItem.delete({ where: { id } });
    await updateDailySummaryNutrition(userId, item.date, nutrition, false);

    return success(res, {}, 'Meal item deleted');
  } catch (err) {
    logger.error({ err }, 'Delete meal item error');
    throw err;
  }
}

// ─── VOICE PARSE LOG ──────────────────────────────────────────────────────────
async function logVoice(req, res) {
  try {
    const { transcript, parsed_foods } = req.body;
    // parsed_foods: [{ food_name, quantity, unit }]
    const userId = req.user.id;

    await prisma.voiceLog.create({
      data: { user_id: userId, transcript, parsed_foods },
    });

    // Try to match parsed foods to DB
    const matched = [];
    for (const item of parsed_foods) {
      const food = await prisma.food.findFirst({
        where: { name: { contains: item.food_name, mode: 'insensitive' }, is_active: true },
        select: { id: true, name: true, calories: true, protein_g: true, carbs_g: true, fats_g: true },
      });
      matched.push({ ...item, food_match: food || null });
    }

    return success(res, { matched_foods: matched }, 'Voice parsed');
  } catch (err) {
    logger.error({ err }, 'Voice log error');
    throw err;
  }
}

// ─── NUTRITION CALCULATE PREVIEW ──────────────────────────────────────────────
async function calculateNutrition(req, res) {
  try {
    const { food_id, quantity_raw } = req.body;
    const food = await prisma.food.findUnique({ where: { id: food_id } });
    if (!food) return notFound(res, 'Food not found');
    const nutrition = calculateFoodNutrition(food, quantity_raw);
    return success(res, { nutrition, food: { id: food.id, name: food.name } });
  } catch (err) {
    logger.error({ err }, 'Calculate nutrition error');
    throw err;
  }
}

module.exports = {
  searchFoods, getFoodByBarcode, getFood,
  logMealItem, logMealItems, getMealItems, updateMealItem, deleteMealItem,
  logVoice, calculateNutrition,
};
