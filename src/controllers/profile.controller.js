// src/controllers/profile.controller.js
'use strict';

const prisma = require('../config/db');
const { calculateTDEE, calculateMacroTargets } = require('../utils/calc');
const { success, created, error, notFound } = require('../utils/response');
const logger = require('../utils/logger');

// ─── CREATE / UPDATE FITNESS PROFILE ─────────────────────────────────────────
async function upsertProfile(req, res) {
  try {
    const { age, gender, height_cm, weight_kg, body_fat_pct, activity_level, primary_goal } = req.body;
    const userId = req.user.id;

    const profile = await prisma.fitnessProfile.upsert({
      where: { user_id: userId },
      create: { user_id: userId, age, gender, height_cm, weight_kg, body_fat_pct, activity_level, primary_goal },
      update: { age, gender, height_cm, weight_kg, body_fat_pct, activity_level, primary_goal },
    });

    // Auto-calculate recommended macro targets
    const tdee = calculateTDEE(gender, weight_kg, height_cm, age, activity_level);
    const macros = calculateMacroTargets(primary_goal, weight_kg, tdee);

    // Upsert goals with recommended values (user can override)
    await prisma.userGoal.updateMany({ where: { user_id: userId }, data: { is_active: false } });
    const goals = await prisma.userGoal.create({
      data: {
        user_id: userId,
        target_calories: macros.calories,
        target_protein_g: macros.protein_g,
        target_carbs_g: macros.carbs_g,
        target_fats_g: macros.fats_g,
        target_fiber_g: macros.fiber_g,
      },
    });

    return success(res, { profile, recommended_goals: goals, tdee }, 'Profile updated');
  } catch (err) {
    logger.error({ err }, 'Upsert profile error');
    throw err;
  }
}

// ─── GET PROFILE ──────────────────────────────────────────────────────────────
async function getProfile(req, res) {
  try {
    const profile = await prisma.fitnessProfile.findUnique({
      where: { user_id: req.user.id },
    });
    if (!profile) return notFound(res, 'Profile not set up yet');

    const tdee = calculateTDEE(profile.gender, profile.weight_kg, profile.height_cm, profile.age, profile.activity_level);
    return success(res, { profile, tdee });
  } catch (err) {
    logger.error({ err }, 'Get profile error');
    throw err;
  }
}

// ─── SET GOALS ────────────────────────────────────────────────────────────────
async function setGoals(req, res) {
  try {
    const { target_calories, target_protein_g, target_carbs_g, target_fats_g, target_fiber_g, target_water_ml } = req.body;
    const userId = req.user.id;

    // Deactivate current goals
    await prisma.userGoal.updateMany({ where: { user_id: userId, is_active: true }, data: { is_active: false } });

    const goals = await prisma.userGoal.create({
      data: {
        user_id: userId,
        target_calories,
        target_protein_g,
        target_carbs_g,
        target_fats_g,
        target_fiber_g: target_fiber_g || 25,
        target_water_ml: target_water_ml || 2500,
      },
    });

    return created(res, { goals }, 'Goals set successfully');
  } catch (err) {
    logger.error({ err }, 'Set goals error');
    throw err;
  }
}

// ─── GET GOALS ────────────────────────────────────────────────────────────────
async function getGoals(req, res) {
  try {
    const goals = await prisma.userGoal.findFirst({
      where: { user_id: req.user.id, is_active: true },
      orderBy: { created_at: 'desc' },
    });
    if (!goals) return notFound(res, 'No goals set. Please complete your profile setup.');
    return success(res, { goals });
  } catch (err) {
    logger.error({ err }, 'Get goals error');
    throw err;
  }
}

// ─── UPDATE WEIGHT (progress tracking) ────────────────────────────────────────
async function updateWeight(req, res) {
  try {
    const { weight_kg } = req.body;
    const userId = req.user.id;

    const profile = await prisma.fitnessProfile.update({
      where: { user_id: userId },
      data: { weight_kg },
    });

    return success(res, { profile }, 'Weight updated');
  } catch (err) {
    logger.error({ err }, 'Update weight error');
    throw err;
  }
}

// ─── GET RECOMMENDED MACROS ───────────────────────────────────────────────────
async function getRecommendedMacros(req, res) {
  try {
    const profile = await prisma.fitnessProfile.findUnique({ where: { user_id: req.user.id } });
    if (!profile) return notFound(res, 'Please set up your fitness profile first');

    const tdee = calculateTDEE(profile.gender, profile.weight_kg, profile.height_cm, profile.age, profile.activity_level);
    const recommended = calculateMacroTargets(profile.primary_goal, profile.weight_kg, tdee);

    return success(res, { tdee, recommended });
  } catch (err) {
    logger.error({ err }, 'Get recommended macros error');
    throw err;
  }
}

module.exports = { upsertProfile, getProfile, setGoals, getGoals, updateWeight, getRecommendedMacros };
