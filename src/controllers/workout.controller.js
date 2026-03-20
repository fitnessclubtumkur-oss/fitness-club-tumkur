// src/controllers/workout.controller.js
'use strict';

const prisma = require('../config/db');
const { calculateCaloriesBurned, calculatePace } = require('../utils/calc');
const { success, created, error, notFound } = require('../utils/response');
const logger = require('../utils/logger');

// Helper to update daily summary calories burned
async function updateDailySummaryCalories(userId, date, calDelta) {
  const dateOnly = new Date(date);
  dateOnly.setHours(0, 0, 0, 0);

  await prisma.dailySummary.upsert({
    where: { user_id_date: { user_id: userId, date: dateOnly } },
    create: {
      user_id: userId,
      date: dateOnly,
      total_calories_burned: calDelta > 0 ? calDelta : 0,
      net_calories: -(calDelta > 0 ? calDelta : 0),
      workout_count: 1,
    },
    update: {
      total_calories_burned: { increment: calDelta },
      net_calories: { decrement: calDelta },
      workout_count: { increment: 1 },
    },
  });
}

// ─── LOG CARDIO ──────────────────────────────────────────────────────────────
async function logCardio(req, res) {
  try {
    const { duration_min, intensity = 'MODERATE', date, notes } = req.body;
    const userId = req.user.id;

    const profile = await prisma.fitnessProfile.findUnique({ where: { user_id: userId } });
    const weightKg = profile?.weight_kg || 70;

    const calories = calculateCaloriesBurned('CARDIO', weightKg, duration_min, intensity);

    const workout = await prisma.workout.create({
      data: {
        user_id: userId,
        type: 'CARDIO',
        date: new Date(date),
        duration_min,
        calories_burned: calories,
        notes,
        metadata: { intensity },
      },
    });

    await updateDailySummaryCalories(userId, date, calories);

    return created(res, { workout, calories_burned: calories }, 'Cardio logged');
  } catch (err) {
    logger.error({ err }, 'Log cardio error');
    throw err;
  }
}

// ─── LOG RESISTANCE ───────────────────────────────────────────────────────────
async function logResistance(req, res) {
  try {
    const { exercises, date, notes } = req.body;
    // exercises: [{ exercise, sets: [{ reps, weight_kg }] }]
    const userId = req.user.id;

    const profile = await prisma.fitnessProfile.findUnique({ where: { user_id: userId } });
    const weightKg = profile?.weight_kg || 70;

    // Estimate duration from number of sets (~3 min per set)
    const totalSets = exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
    const durationMin = Math.max(totalSets * 3, 20);
    const calories = calculateCaloriesBurned('RESISTANCE', weightKg, durationMin, 'MODERATE');

    // Calculate total volume
    const totalVolume = exercises.reduce((sum, ex) =>
      sum + ex.sets.reduce((s2, set) => s2 + (set.reps || 0) * (set.weight_kg || 0), 0), 0);

    const workout = await prisma.workout.create({
      data: {
        user_id: userId,
        type: 'RESISTANCE',
        date: new Date(date),
        duration_min: durationMin,
        calories_burned: calories,
        notes,
        metadata: { exercise_count: exercises.length, total_sets: totalSets, total_volume_kg: totalVolume },
        exercise_logs: {
          create: exercises.flatMap(ex =>
            ex.sets.map((set, i) => ({
              exercise: ex.exercise,
              set_number: i + 1,
              reps: set.reps,
              weight_kg: set.weight_kg,
              duration_s: set.duration_s,
              notes: set.notes,
            }))
          ),
        },
      },
      include: { exercise_logs: true },
    });

    await updateDailySummaryCalories(userId, date, calories);

    return created(res, { workout, calories_burned: calories, total_volume_kg: totalVolume }, 'Resistance workout logged');
  } catch (err) {
    logger.error({ err }, 'Log resistance error');
    throw err;
  }
}

// ─── LOG YOGA ─────────────────────────────────────────────────────────────────
async function logYoga(req, res) {
  try {
    const { yoga_type = 'HATHA', duration_min, date, notes } = req.body;
    const userId = req.user.id;

    const profile = await prisma.fitnessProfile.findUnique({ where: { user_id: userId } });
    const weightKg = profile?.weight_kg || 70;

    const intensityMap = { HATHA: 'LOW', VINYASA: 'MODERATE', ASHTANGA: 'HIGH', BIKRAM: 'HIGH', POWER: 'VERY_HIGH', RESTORATIVE: 'LOW' };
    const intensity = intensityMap[yoga_type] || 'MODERATE';
    const calories = calculateCaloriesBurned('YOGA', weightKg, duration_min, intensity);

    const workout = await prisma.workout.create({
      data: {
        user_id: userId,
        type: 'YOGA',
        date: new Date(date),
        duration_min,
        calories_burned: calories,
        notes,
        metadata: { yoga_type, intensity },
      },
    });

    await updateDailySummaryCalories(userId, date, calories);
    return created(res, { workout, calories_burned: calories }, 'Yoga session logged');
  } catch (err) {
    logger.error({ err }, 'Log yoga error');
    throw err;
  }
}

// ─── LOG AEROBICS ─────────────────────────────────────────────────────────────
async function logAerobics(req, res) {
  try {
    const { duration_min, intensity = 'MODERATE', aerobics_type = 'GENERAL', date, notes } = req.body;
    const userId = req.user.id;

    const profile = await prisma.fitnessProfile.findUnique({ where: { user_id: userId } });
    const weightKg = profile?.weight_kg || 70;

    const calories = calculateCaloriesBurned('AEROBICS', weightKg, duration_min, intensity);

    const workout = await prisma.workout.create({
      data: {
        user_id: userId,
        type: 'AEROBICS',
        date: new Date(date),
        duration_min,
        calories_burned: calories,
        notes,
        metadata: { aerobics_type, intensity },
      },
    });

    await updateDailySummaryCalories(userId, date, calories);
    return created(res, { workout, calories_burned: calories }, 'Aerobics session logged');
  } catch (err) {
    logger.error({ err }, 'Log aerobics error');
    throw err;
  }
}

// ─── LOG RUNNING ──────────────────────────────────────────────────────────────
async function logRunning(req, res) {
  try {
    const { distance_km, duration_min, route_name, date, notes } = req.body;
    const userId = req.user.id;

    const profile = await prisma.fitnessProfile.findUnique({ where: { user_id: userId } });
    const weightKg = profile?.weight_kg || 70;

    // Calculate pace
    const pace = calculatePace(distance_km, duration_min); // min/km

    // Determine intensity from pace
    let intensity = 'MODERATE';
    if (pace && pace < 5.5) intensity = 'VERY_HIGH';
    else if (pace && pace < 7) intensity = 'HIGH';
    else if (pace && pace > 10) intensity = 'LOW';

    const calories = calculateCaloriesBurned('RUNNING', weightKg, duration_min || (distance_km / 8 * 60), intensity);

    const workout = await prisma.workout.create({
      data: {
        user_id: userId,
        type: 'RUNNING',
        date: new Date(date),
        duration_min: duration_min || Math.round(distance_km / 8 * 60),
        calories_burned: calories,
        notes,
        metadata: { distance_km, pace_min_km: pace, route_name, intensity },
      },
    });

    await updateDailySummaryCalories(userId, date, calories);
    return created(res, { workout, calories_burned: calories, pace_min_km: pace }, 'Run logged');
  } catch (err) {
    logger.error({ err }, 'Log running error');
    throw err;
  }
}

// ─── LOG TREKKING ─────────────────────────────────────────────────────────────
async function logTrekking(req, res) {
  try {
    const { distance_km, duration_min, elevation_m = 0, trail_name, date, notes } = req.body;
    const userId = req.user.id;

    const profile = await prisma.fitnessProfile.findUnique({ where: { user_id: userId } });
    const weightKg = profile?.weight_kg || 70;

    // Intensity based on elevation
    let intensity = 'MODERATE';
    if (elevation_m > 1000) intensity = 'VERY_HIGH';
    else if (elevation_m > 500) intensity = 'HIGH';
    else if (elevation_m < 100) intensity = 'LOW';

    const calories = calculateCaloriesBurned('TREKKING', weightKg, duration_min, intensity, elevation_m);

    const workout = await prisma.workout.create({
      data: {
        user_id: userId,
        type: 'TREKKING',
        date: new Date(date),
        duration_min,
        calories_burned: calories,
        notes,
        metadata: { distance_km, elevation_m, trail_name, intensity },
      },
    });

    await updateDailySummaryCalories(userId, date, calories);
    return created(res, { workout, calories_burned: calories, elevation_m }, 'Trek logged');
  } catch (err) {
    logger.error({ err }, 'Log trekking error');
    throw err;
  }
}

// ─── GET WORKOUTS (by date) ───────────────────────────────────────────────────
async function getWorkouts(req, res) {
  try {
    const { date, start_date, end_date, type, page = 1, limit = 20 } = req.query;
    const userId = req.user.id;

    const where = { user_id: userId };

    if (date) {
      const d = new Date(date);
      where.date = d;
    } else if (start_date && end_date) {
      where.date = { gte: new Date(start_date), lte: new Date(end_date) };
    }

    if (type) where.type = type;

    const [workouts, total] = await Promise.all([
      prisma.workout.findMany({
        where,
        include: { exercise_logs: true },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: parseInt(limit),
      }),
      prisma.workout.count({ where }),
    ]);

    return success(res, { workouts, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    logger.error({ err }, 'Get workouts error');
    throw err;
  }
}

// ─── UPDATE WORKOUT ────────────────────────────────────────────────────────────
async function updateWorkout(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const existing = await prisma.workout.findFirst({ where: { id, user_id: userId } });
    if (!existing) return notFound(res, 'Workout not found');

    const { duration_min, notes, metadata } = req.body;

    const updated = await prisma.workout.update({
      where: { id },
      data: { duration_min, notes, metadata },
    });

    return success(res, { workout: updated }, 'Workout updated');
  } catch (err) {
    logger.error({ err }, 'Update workout error');
    throw err;
  }
}

// ─── DELETE WORKOUT ────────────────────────────────────────────────────────────
async function deleteWorkout(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const workout = await prisma.workout.findFirst({ where: { id, user_id: userId } });
    if (!workout) return notFound(res, 'Workout not found');

    // Update daily summary
    await prisma.dailySummary.updateMany({
      where: { user_id: userId, date: workout.date },
      data: {
        total_calories_burned: { decrement: workout.calories_burned },
        net_calories: { increment: workout.calories_burned },
        workout_count: { decrement: 1 },
      },
    });

    await prisma.workout.delete({ where: { id } });

    return success(res, {}, 'Workout deleted');
  } catch (err) {
    logger.error({ err }, 'Delete workout error');
    throw err;
  }
}

// ─── WORKOUT STATS ────────────────────────────────────────────────────────────
async function getWorkoutStats(req, res) {
  try {
    const { period = 'MONTH' } = req.query;
    const userId = req.user.id;

    const now = new Date();
    let startDate = new Date();
    if (period === 'WEEK') startDate.setDate(now.getDate() - 7);
    else if (period === 'MONTH') startDate.setMonth(now.getMonth() - 1);
    else if (period === 'YEAR') startDate.setFullYear(now.getFullYear() - 1);

    const workouts = await prisma.workout.findMany({
      where: { user_id: userId, date: { gte: startDate } },
    });

    const stats = {
      total_workouts: workouts.length,
      total_calories_burned: workouts.reduce((s, w) => s + w.calories_burned, 0),
      total_duration_min: workouts.reduce((s, w) => s + (w.duration_min || 0), 0),
      by_type: {},
    };

    for (const w of workouts) {
      if (!stats.by_type[w.type]) stats.by_type[w.type] = { count: 0, calories: 0, duration_min: 0 };
      stats.by_type[w.type].count++;
      stats.by_type[w.type].calories += w.calories_burned;
      stats.by_type[w.type].duration_min += (w.duration_min || 0);
    }

    return success(res, { stats, period });
  } catch (err) {
    logger.error({ err }, 'Get workout stats error');
    throw err;
  }
}

module.exports = {
  logCardio, logResistance, logYoga, logAerobics, logRunning, logTrekking,
  getWorkouts, updateWorkout, deleteWorkout, getWorkoutStats,
};
