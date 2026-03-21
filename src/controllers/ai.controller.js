// src/controllers/ai.controller.js
// Phase 2B — Claude API: weekly narrative + photo recognition + recipes + mood insights
'use strict';

const prisma  = require('../config/db');
const config  = require('../config');
const { success, created, error, notFound } = require('../utils/response');
const logger  = require('../utils/logger');

// ─── CLAUDE API HELPER ────────────────────────────────────────────────────────
async function callClaude(messages, maxTokens = 800, system = '') {
  const apiKey = config.claude && config.claude.apiKey;
  if (!apiKey) {
    throw Object.assign(new Error('CLAUDE_API_KEY not set in Railway Variables'), { code: 'NO_KEY' });
  }

  const body = {
    model:      'claude-sonnet-4-6',
    max_tokens: maxTokens,
    messages,
  };
  if (system) body.system = system;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Claude API ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return (data.content && data.content[0] && data.content[0].text) || '';
}

function noKeyError(res) {
  return error(res, 'AI features require CLAUDE_API_KEY. Add it in Railway → Variables.', 503);
}

// ─── WEEKLY NARRATIVE INSIGHT ─────────────────────────────────────────────────
async function generateWeeklyInsight(req, res) {
  try {
    const userId = req.user.id;
    const force  = req.query.force === 'true';

    // Week start (Sunday)
    const weekOf = new Date();
    weekOf.setDate(weekOf.getDate() - weekOf.getDay());
    weekOf.setHours(0, 0, 0, 0);

    // Return cached unless forced
    if (!force) {
      const cached = await prisma.aiInsight.findUnique({
        where: { user_id_week_of: { user_id: userId, week_of: weekOf } },
      });
      if (cached) return success(res, { insight: cached, cached: true });
    }

    const [profile, goals, workouts, summaries, moods] = await Promise.all([
      prisma.fitnessProfile.findUnique({ where: { user_id: userId } }),
      prisma.userGoal.findFirst({ where: { user_id: userId, is_active: true } }),
      prisma.workout.findMany({
        where: { user_id: userId, date: { gte: new Date(Date.now() - 28 * 86400000) } },
        orderBy: { date: 'asc' },
      }),
      prisma.dailySummary.findMany({
        where: { user_id: userId, date: { gte: new Date(Date.now() - 28 * 86400000) } },
        orderBy: { date: 'asc' },
      }),
      prisma.moodTracking.findMany({
        where: { user_id: userId, date: { gte: new Date(Date.now() - 28 * 86400000) } },
      }),
    ]);

    if (!profile || !goals) {
      return error(res, 'Complete your profile setup first to get AI insights');
    }

    const m = buildMetrics(workouts, summaries, moods, goals);

    const system = `You are FitFuel's personal AI coach for Indian fitness enthusiasts.
Write a concise, motivational weekly fitness narrative (300-400 words) that:
- References the user's EXACT numbers (not generic advice)
- Suggests Indian foods (dal, paneer, roti, idli, chicken, eggs etc.) for nutrition gaps
- Is warm, honest, and data-driven
- Ends with exactly 3 specific action items for next week as a numbered list`;

    const userMsg = `Generate a personalised weekly story for:
Profile: ${profile.age}yr ${profile.gender}, ${profile.weight_kg}kg, Goal: ${profile.primary_goal}
Targets: ${goals.target_calories} kcal · ${goals.target_protein_g}g protein

Last 4 weeks:
- Workouts: ${m.totalWorkouts} sessions (${m.workoutDays}/28 active days)
- Types: ${JSON.stringify(m.byType)}
- Calories burned: ${m.totalCaloriesBurned.toFixed(0)} kcal total
- Avg daily intake: ${m.avgCalories.toFixed(0)} kcal (goal: ${goals.target_calories})
- Avg protein: ${m.avgProtein.toFixed(1)}g/day (goal: ${goals.target_protein_g}g)
- Protein goal hit: ${m.proteinGoalDays}/28 days
- Running: ${m.totalRunKm.toFixed(1)} km
- Sleep avg: ${m.avgSleep ? m.avgSleep.toFixed(1) + 'h' : 'not tracked'}
- Mood avg: ${m.avgMood ? m.avgMood.toFixed(1) + '/5' : 'not tracked'}
- Best workout: ${m.bestWorkout || 'none'}
- Current streak: ${m.currentStreak} days`;

    const narrative = await callClaude(
      [{ role: 'user', content: userMsg }],
      600, system
    );

    // Extract recommendations from narrative
    const recsPrompt = `From this fitness narrative, extract exactly 3 action items as JSON array.
Format: [{"title":"short title","detail":"one sentence","priority":"HIGH|MEDIUM|LOW"}]
Return ONLY the JSON array, no other text.\n\n${narrative}`;

    let recommendations = [];
    try {
      const recsText = await callClaude([{ role: 'user', content: recsPrompt }], 250);
      recommendations = JSON.parse(recsText.replace(/```json|```/g, '').trim());
    } catch { recommendations = []; }

    const insight = await prisma.aiInsight.upsert({
      where:  { user_id_week_of: { user_id: userId, week_of: weekOf } },
      create: { user_id: userId, week_of: weekOf, narrative_text: narrative, key_metrics: m, recommendations },
      update: { narrative_text: narrative, key_metrics: m, recommendations, generated_at: new Date() },
    });

    logger.info({ userId }, 'Weekly insight generated');
    return success(res, { insight, cached: false });
  } catch (err) {
    if (err.code === 'NO_KEY') return noKeyError(res);
    logger.error({ err }, 'Generate insight error');
    throw err;
  }
}

async function getInsights(req, res) {
  try {
    const insights = await prisma.aiInsight.findMany({
      where:   { user_id: req.user.id },
      orderBy: { week_of: 'desc' },
      take:    12,
    });
    return success(res, { insights });
  } catch (err) {
    logger.error({ err }, 'Get insights error');
    throw err;
  }
}

// ─── PHOTO MEAL RECOGNITION ───────────────────────────────────────────────────
async function analyzeMealPhoto(req, res) {
  try {
    const { image_base64, media_type = 'image/jpeg' } = req.body;
    if (!image_base64) return error(res, 'image_base64 required');

    const messages = [{
      role: 'user',
      content: [
        {
          type:   'image',
          source: { type: 'base64', media_type, data: image_base64 },
        },
        {
          type: 'text',
          text: `Analyze this meal photo. Identify all Indian food items and estimate portions.
Use plate/bowl size as reference. Consider common Indian meals: rice, roti, dal, sabzi, curry, idli, dosa, paneer, chicken, eggs.
Return ONLY valid JSON: {"foods":[{"name":"Rice","quantity_g":150,"unit":"GRAMS","confidence":0.9}],"meal_description":"brief description"}
Use ML for liquids, GRAMS for solids.`,
        },
      ],
    }];

    const system = 'You are a nutrition AI specialised in Indian cuisine. Always return valid JSON only.';
    const text   = await callClaude(messages, 400, system);

    let parsed;
    try {
      parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch {
      return error(res, 'Could not parse meal from photo — try a clearer, well-lit image');
    }

    // Match each identified food to the database
    const matched = [];
    for (const item of (parsed.foods || [])) {
      const food = await prisma.food.findFirst({
        where: {
          OR: [
            { name: { contains: item.name,               mode: 'insensitive' } },
            { name: { contains: item.name.split(' ')[0], mode: 'insensitive' } },
          ],
          is_active: true,
        },
        select: { id: true, name: true, calories: true, protein_g: true, carbs_g: true, fats_g: true, fiber_g: true },
      });

      const qty    = item.quantity_g || item.quantity_ml || 100;
      const factor = qty / 100;

      matched.push({
        identified_name: item.name,
        quantity_g:      qty,
        unit:            item.unit || 'GRAMS',
        confidence:      item.confidence || 0.7,
        food_match:      food || null,
        estimated_nutrition: food ? {
          calories:  Math.round(food.calories  * factor),
          protein_g: +(food.protein_g * factor).toFixed(1),
          carbs_g:   +(food.carbs_g   * factor).toFixed(1),
          fats_g:    +(food.fats_g    * factor).toFixed(1),
        } : null,
      });
    }

    // Log for ML improvement
    await prisma.visionLog.create({
      data: { user_id: req.user.id, image_url: 'base64_upload', identified_foods: parsed.foods || [] },
    }).catch(() => {});

    return success(res, {
      meal_description: parsed.meal_description || '',
      matched_foods:    matched,
      matched_count:    matched.filter(m => m.food_match).length,
      total_identified: matched.length,
    });
  } catch (err) {
    if (err.code === 'NO_KEY') return noKeyError(res);
    logger.error({ err }, 'Photo analysis error');
    throw err;
  }
}

// ─── AI VOICE PARSE ───────────────────────────────────────────────────────────
async function parseVoiceMeal(req, res) {
  try {
    const { transcript } = req.body;
    const userId = req.user.id;

    let parsed = [];
    let method = 'simple';

    if (config.claude && config.claude.apiKey) {
      try {
        const text = await callClaude(
          [{ role: 'user', content: `Parse this spoken meal into JSON: "${transcript}"
Return ONLY a JSON array: [{"food_name":"Rice","quantity":150,"unit":"grams"}]
Estimate quantities if unstated (bowl of dal = 150g, 2 rotis = 100g, glass of milk = 200ml).
Use common Indian food names.` }],
          300,
          'You are a nutrition parser for Indian food. Return only valid JSON arrays.'
        );
        parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
        method = 'ai';
      } catch { parsed = simpleVoiceParse(transcript); }
    } else {
      parsed = simpleVoiceParse(transcript);
    }

    const matched = [];
    for (const item of parsed) {
      const food = await prisma.food.findFirst({
        where: { name: { contains: (item.food_name || '').split(' ')[0], mode: 'insensitive' }, is_active: true },
        select: { id: true, name: true, calories: true, protein_g: true },
      });
      matched.push({ ...item, food_match: food || null });
    }

    await prisma.voiceLog.create({
      data: { user_id: userId, transcript, parsed_foods: parsed },
    }).catch(() => {});

    return success(res, { transcript, matched_foods: matched, method });
  } catch (err) {
    logger.error({ err }, 'Voice parse error');
    throw err;
  }
}

// ─── RECIPES ──────────────────────────────────────────────────────────────────
async function saveRecipe(req, res) {
  try {
    const { template_name, category, is_public = false, items } = req.body;
    const userId = req.user.id;

    let totals = { cal: 0, prot: 0, carb: 0, fat: 0 };
    const validItems = [];

    for (const item of items) {
      const food = await prisma.food.findUnique({ where: { id: item.food_id } });
      if (!food) continue;
      const f = item.quantity_raw / 100;
      totals.cal  += food.calories  * f;
      totals.prot += food.protein_g * f;
      totals.carb += food.carbs_g   * f;
      totals.fat  += food.fats_g    * f;
      validItems.push(item);
    }

    const template = await prisma.mealTemplate.create({
      data: {
        user_id:         userId,
        template_name,
        category,
        is_public,
        total_calories:  Math.round(totals.cal),
        total_protein_g: +(totals.prot.toFixed(1)),
        total_carbs_g:   +(totals.carb.toFixed(1)),
        total_fats_g:    +(totals.fat.toFixed(1)),
        template_items: {
          create: validItems.map(i => ({
            food_id:      i.food_id,
            quantity_raw: i.quantity_raw,
            unit:         i.unit || 'GRAMS',
          })),
        },
      },
      include: { template_items: { include: { food: { select: { name: true } } } } },
    });

    return created(res, { template }, 'Recipe saved!');
  } catch (err) {
    logger.error({ err }, 'Save recipe error');
    throw err;
  }
}

async function getMyRecipes(req, res) {
  try {
    const recipes = await prisma.mealTemplate.findMany({
      where:   { user_id: req.user.id },
      include: { template_items: { include: { food: { select: { id: true, name: true } } } } },
      orderBy: { created_at: 'desc' },
    });
    return success(res, { recipes });
  } catch (err) {
    logger.error({ err }, 'Get recipes error');
    throw err;
  }
}

async function getCommunityRecipes(req, res) {
  try {
    const { category, search, sort = 'rating', page = 1, limit = 20 } = req.query;
    const where = { is_public: true };
    if (category) where.category = category;
    if (search)   where.template_name = { contains: search, mode: 'insensitive' };

    const [recipes, total] = await Promise.all([
      prisma.mealTemplate.findMany({
        where,
        include: {
          user:           { select: { name: true } },
          template_items: { include: { food: { select: { name: true } } }, take: 5 },
        },
        orderBy: sort === 'rating' ? { avg_rating: 'desc' } : { created_at: 'desc' },
        skip:    (page - 1) * limit,
        take:    parseInt(limit),
      }),
      prisma.mealTemplate.count({ where }),
    ]);

    return success(res, { recipes, total, page: parseInt(page) });
  } catch (err) {
    logger.error({ err }, 'Community recipes error');
    throw err;
  }
}

async function quickLogRecipe(req, res) {
  try {
    const { id }                 = req.params;
    const { meal_type, date }    = req.body;
    const userId                 = req.user.id;

    const template = await prisma.mealTemplate.findUnique({
      where:   { id },
      include: { template_items: { include: { food: true } } },
    });
    if (!template) return notFound(res, 'Recipe not found');

    const logDate = new Date(date); logDate.setHours(0, 0, 0, 0);
    let totals = { calories: 0, protein_g: 0, carbs_g: 0, fats_g: 0, fiber_g: 0 };

    for (const item of template.template_items) {
      const f   = item.quantity_raw / 100;
      const nut = {
        calories:  Math.round(item.food.calories  * f),
        protein_g: +(item.food.protein_g * f).toFixed(1),
        carbs_g:   +(item.food.carbs_g   * f).toFixed(1),
        fats_g:    +(item.food.fats_g    * f).toFixed(1),
        fiber_g:   +(item.food.fiber_g   * f).toFixed(1),
      };
      Object.keys(totals).forEach(k => totals[k] += nut[k]);

      await prisma.mealItem.create({
        data: { user_id: userId, food_id: item.food_id, meal_type, date: logDate, quantity_raw: item.quantity_raw, unit: item.unit, ...nut },
      });
    }

    await prisma.dailySummary.upsert({
      where:  { user_id_date: { user_id: userId, date: logDate } },
      create: { user_id: userId, date: logDate, total_calories_consumed: totals.calories, total_protein_g: totals.protein_g, total_carbs_g: totals.carbs_g, total_fats_g: totals.fats_g, total_fiber_g: totals.fiber_g },
      update: { total_calories_consumed: { increment: totals.calories }, total_protein_g: { increment: totals.protein_g }, total_carbs_g: { increment: totals.carbs_g }, total_fats_g: { increment: totals.fats_g }, total_fiber_g: { increment: totals.fiber_g } },
    });

    return created(res, { items_logged: template.template_items.length, total_nutrition: totals, recipe_name: template.template_name },
      `${template.template_name} logged — ${totals.calories} kcal`);
  } catch (err) {
    logger.error({ err }, 'Quick log recipe error');
    throw err;
  }
}

async function rateRecipe(req, res) {
  try {
    const { id } = req.params;
    const { rating, review_text } = req.body;

    await prisma.recipeReview.upsert({
      where:  { template_id_user_id: { template_id: id, user_id: req.user.id } },
      create: { template_id: id, user_id: req.user.id, rating, review_text },
      update: { rating, review_text },
    });

    const agg = await prisma.recipeReview.aggregate({
      where: { template_id: id },
      _avg:  { rating: true },
      _count: { rating: true },
    });

    await prisma.mealTemplate.update({
      where: { id },
      data:  { avg_rating: +((agg._avg.rating || 0).toFixed(1)), review_count: agg._count.rating },
    });

    return success(res, {}, 'Recipe rated!');
  } catch (err) {
    logger.error({ err }, 'Rate recipe error');
    throw err;
  }
}

// ─── MOOD INSIGHTS ────────────────────────────────────────────────────────────
async function getMoodInsights(req, res) {
  try {
    const userId = req.user.id;
    const since  = new Date(Date.now() - 28 * 86400000);

    const [moods, summaries] = await Promise.all([
      prisma.moodTracking.findMany({ where: { user_id: userId, date: { gte: since } }, orderBy: { date: 'asc' } }),
      prisma.dailySummary.findMany({ where: { user_id: userId, date: { gte: since } } }),
    ]);

    const avgSleep  = calcAvg(moods, 'sleep_hours');
    const avgMood   = calcAvg(moods, 'mood_rating');
    const avgStress = calcAvg(moods, 'stress_level');
    const avgEnergy = calcAvg(moods, 'energy_level');

    const insights = [];
    if (avgSleep && avgSleep < 7)  insights.push({ type: 'warning', message: `Avg sleep is ${avgSleep.toFixed(1)}h — below the recommended 7-8h. Poor sleep reduces workout performance by ~15%.` });
    if (avgStress && avgStress > 3) insights.push({ type: 'warning', message: `High stress average (${avgStress.toFixed(1)}/5). Consider yoga or a short walk on stressful days.` });
    if (avgMood && avgMood >= 4)    insights.push({ type: 'success', message: `Great mood average (${avgMood.toFixed(1)}/5)! Positive mindset drives consistency.` });
    if (avgEnergy && avgEnergy >= 4) insights.push({ type: 'success', message: `High energy levels (${avgEnergy.toFixed(1)}/5) — great time to push harder in workouts!` });

    return success(res, {
      moods,
      averages: { sleep_hours: avgSleep, mood: avgMood, stress: avgStress, energy: avgEnergy },
      insights,
      tracking_days: moods.length,
    });
  } catch (err) {
    logger.error({ err }, 'Mood insights error');
    throw err;
  }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function buildMetrics(workouts, summaries, moods, goals) {
  const byType = workouts.reduce((a, w) => { a[w.type] = (a[w.type] || 0) + 1; return a; }, {});
  const totalRunKm = workouts.filter(w => w.type === 'RUNNING').reduce((s, w) => s + ((w.metadata && w.metadata.distance_km) || 0), 0);
  const totalCaloriesBurned = workouts.reduce((s, w) => s + w.calories_burned, 0);

  const avgCalories = summaries.length ? summaries.reduce((s, d) => s + d.total_calories_consumed, 0) / summaries.length : 0;
  const avgProtein  = summaries.length ? summaries.reduce((s, d) => s + d.total_protein_g, 0) / summaries.length : 0;
  const proteinGoalDays = summaries.filter(d => d.total_protein_g >= goals.target_protein_g * 0.9).length;

  const avgSleep = calcAvg(moods, 'sleep_hours');
  const avgMood  = calcAvg(moods, 'mood_rating');

  const best = workouts.reduce((a, b) => b.calories_burned > (a ? a.calories_burned : 0) ? b : a, null);
  const bestWorkout = best ? `${best.type} — ${best.calories_burned.toFixed(0)} kcal` : null;

  const dates = [...new Set(workouts.map(w => w.date && w.date.toISOString().split('T')[0]))].filter(Boolean).sort().reverse();
  let streak = 0;
  for (let i = 0; i < dates.length; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    if (dates[i] === d.toISOString().split('T')[0]) streak++;
    else break;
  }

  return {
    totalWorkouts: workouts.length,
    workoutDays: new Set(dates).size,
    byType, totalRunKm, totalCaloriesBurned,
    avgCalories, avgProtein, proteinGoalDays,
    avgSleep, avgMood, bestWorkout,
    currentStreak: streak,
  };
}

function calcAvg(arr, key) {
  const vals = arr.map(x => x[key]).filter(v => v != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function simpleVoiceParse(transcript) {
  return transcript.split(/[,\.]+/).map(w => w.trim()).filter(Boolean)
    .map(w => ({ food_name: w, quantity: 100, unit: 'grams' })).slice(0, 6);
}

module.exports = {
  generateWeeklyInsight, getInsights,
  analyzeMealPhoto, parseVoiceMeal,
  saveRecipe, getMyRecipes, getCommunityRecipes, quickLogRecipe, rateRecipe,
  getMoodInsights,
};
