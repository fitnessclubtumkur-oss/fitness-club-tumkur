// src/controllers/programs.controller.js
// Phase 3A — Specialist Health Programs + Clinical Tracking
//   • Diabetes 12-week program
//   • PCOS 12-week program
//   • Blood sugar logging (mmol/L ↔ mg/dL)
//   • Menstrual cycle tracking + predictions
'use strict';

const prisma  = require('../config/db');
const { success, created, error, notFound } = require('../utils/response');
const logger  = require('../utils/logger');

// ── BLOOD SUGAR CONVERSION ────────────────────────────────────────────────────
const mmolToMgdl = mmol => Math.round(mmol * 18.018);
const mgdlToMmol = mgdl => Math.round((mgdl / 18.018) * 10) / 10;

// ─────────────────────────────────────────────────────────────────────────────
// SPECIALIST PROGRAMS
// ─────────────────────────────────────────────────────────────────────────────

// ── LIST ALL PROGRAMS ─────────────────────────────────────────────────────────
async function listPrograms(req, res) {
  try {
    const { type } = req.query;
    const where = { is_active: true };
    if (type) where.program_type = type.toUpperCase();

    const programs = await prisma.specialistProgram.findMany({
      where,
      select: {
        id: true, name: true, program_type: true, description: true,
        duration_weeks: true, features: true, price_inr: true,
        _count: { select: { enrollments: true } },
      },
    });

    return success(res, programs.map(p => ({
      ...p,
      enrolled_count: p._count.enrollments,
      _count: undefined,
    })));
  } catch (err) {
    logger.error({ err }, 'listPrograms error');
    throw err;
  }
}

// ── GET PROGRAM DETAIL ────────────────────────────────────────────────────────
async function getProgram(req, res) {
  try {
    const program = await prisma.specialistProgram.findUnique({
      where: { id: req.params.id },
    });
    if (!program) return notFound(res, 'Program not found');
    return success(res, program);
  } catch (err) {
    logger.error({ err }, 'getProgram error');
    throw err;
  }
}

// ── ENROLL IN PROGRAM ─────────────────────────────────────────────────────────
async function enrollProgram(req, res) {
  try {
    const { program_id, notes } = req.body;
    const userId = req.user.id;

    const program = await prisma.specialistProgram.findUnique({ where: { id: program_id } });
    if (!program || !program.is_active) return notFound(res, 'Program not found');

    const existing = await prisma.programEnrollment.findUnique({
      where: { user_id_program_id: { user_id: userId, program_id } },
    });
    if (existing && existing.status === 'ACTIVE') {
      return error(res, 'You are already enrolled in this program', 409);
    }

    const enrollment = existing
      ? await prisma.programEnrollment.update({
          where: { id: existing.id },
          data: { status: 'ACTIVE', started_at: new Date(), current_week: 1 },
        })
      : await prisma.programEnrollment.create({
          data: { user_id: userId, program_id, notes: notes || null },
        });

    // Award enrollment points
    try {
      await prisma.userPoints.upsert({
        where:  { user_id: userId },
        create: { user_id: userId, total_points: 50, weekly_points: 50, monthly_points: 50 },
        update: { total_points: { increment: 50 }, weekly_points: { increment: 50 }, monthly_points: { increment: 50 } },
      });
    } catch (_) {}

    return created(res, {
      enrollment_id:  enrollment.id,
      program_name:   program.name,
      program_type:   program.program_type,
      duration_weeks: program.duration_weeks,
      current_week:   enrollment.current_week,
      started_at:     enrollment.started_at,
    }, `Enrolled in ${program.name}`);
  } catch (err) {
    logger.error({ err }, 'enrollProgram error');
    throw err;
  }
}

// ── MY ENROLLMENTS ────────────────────────────────────────────────────────────
async function myEnrollments(req, res) {
  try {
    const userId = req.user.id;
    const enrollments = await prisma.programEnrollment.findMany({
      where:   { user_id: userId },
      include: { program: { select: { name: true, program_type: true, duration_weeks: true, features: true } } },
      orderBy: { started_at: 'desc' },
    });

    const enriched = enrollments.map(e => {
      const weeksPassed  = Math.floor((Date.now() - new Date(e.started_at)) / (7 * 24 * 3600_000));
      const progressPct  = Math.min(100, Math.round((weeksPassed / e.program.duration_weeks) * 100));
      return { ...e, weeks_passed: weeksPassed, progress_pct: progressPct };
    });

    return success(res, enriched);
  } catch (err) {
    logger.error({ err }, 'myEnrollments error');
    throw err;
  }
}

// ── ADVANCE WEEK ──────────────────────────────────────────────────────────────
async function advanceWeek(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const enrollment = await prisma.programEnrollment.findFirst({
      where: { id, user_id: userId },
      include: { program: true },
    });
    if (!enrollment)              return notFound(res, 'Enrollment not found');
    if (enrollment.status !== 'ACTIVE') return error(res, 'Program is not active');
    if (enrollment.current_week >= enrollment.program.duration_weeks) {
      // Complete the program
      await prisma.programEnrollment.update({
        where: { id },
        data: { status: 'COMPLETED', completed_at: new Date() },
      });
      return success(res, { completed: true, message: `🎉 Congratulations! You completed ${enrollment.program.name}!` });
    }

    const updated = await prisma.programEnrollment.update({
      where: { id },
      data:  { current_week: { increment: 1 } },
    });

    return success(res, {
      current_week:   updated.current_week,
      duration_weeks: enrollment.program.duration_weeks,
      progress_pct:   Math.round((updated.current_week / enrollment.program.duration_weeks) * 100),
    }, `Week ${updated.current_week} started!`);
  } catch (err) {
    logger.error({ err }, 'advanceWeek error');
    throw err;
  }
}

// ── PAUSE / DROP ENROLLMENT ───────────────────────────────────────────────────
async function updateEnrollmentStatus(req, res) {
  try {
    const { id } = req.params;
    const { action } = req.body; // pause | drop | resume
    const userId = req.user.id;

    const statusMap = { pause: 'PAUSED', drop: 'DROPPED', resume: 'ACTIVE' };
    const newStatus = statusMap[action];
    if (!newStatus) return error(res, 'Invalid action. Use: pause, resume, drop');

    const enrollment = await prisma.programEnrollment.findFirst({
      where: { id, user_id: userId },
    });
    if (!enrollment) return notFound(res, 'Enrollment not found');

    await prisma.programEnrollment.update({ where: { id }, data: { status: newStatus } });
    return success(res, { status: newStatus }, `Enrollment ${action}d`);
  } catch (err) {
    logger.error({ err }, 'updateEnrollmentStatus error');
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOOD SUGAR LOGGING
// ─────────────────────────────────────────────────────────────────────────────

// ── LOG BLOOD SUGAR ───────────────────────────────────────────────────────────
async function logBloodSugar(req, res) {
  try {
    const userId = req.user.id;
    const { reading, unit = 'mmol', log_type, meal_ref, notes, logged_at } = req.body;

    const readingNum = Number(reading);
    const mmol = unit === 'mgdl' ? mgdlToMmol(readingNum) : readingNum;
    const mgdl = mmolToMgdl(mmol);

    // Risk classification
    const risk = classifyBloodSugar(mmol, log_type);

    const log = await prisma.bloodSugarLog.create({
      data: {
        user_id:      userId,
        reading_mmol: mmol,
        reading_mgdl: mgdl,
        log_type:     log_type.toUpperCase(),
        meal_ref:     meal_ref || null,
        notes:        notes || null,
        logged_at:    logged_at ? new Date(logged_at) : new Date(),
      },
    });

    return created(res, {
      id:           log.id,
      reading_mmol: mmol,
      reading_mgdl: mgdl,
      log_type,
      risk_level:   risk.level,
      risk_message: risk.message,
    }, 'Blood sugar logged');
  } catch (err) {
    logger.error({ err }, 'logBloodSugar error');
    throw err;
  }
}

// ── GET BLOOD SUGAR LOGS ──────────────────────────────────────────────────────
async function getBloodSugarLogs(req, res) {
  try {
    const userId = req.user.id;
    const { start, end, log_type, page = 1, limit = 30 } = req.query;

    const where = { user_id: userId };
    if (log_type) where.log_type = log_type.toUpperCase();
    if (start || end) {
      where.logged_at = {};
      if (start) where.logged_at.gte = new Date(start);
      if (end)   where.logged_at.lte = new Date(end);
    }

    const [logs, total] = await Promise.all([
      prisma.bloodSugarLog.findMany({
        where,
        orderBy: { logged_at: 'desc' },
        skip:  (page - 1) * Number(limit),
        take:  Number(limit),
      }),
      prisma.bloodSugarLog.count({ where }),
    ]);

    // Summary stats
    const allReadings = logs.map(l => l.reading_mmol);
    const stats = allReadings.length ? {
      avg_mmol:    Math.round((allReadings.reduce((s, v) => s + v, 0) / allReadings.length) * 10) / 10,
      min_mmol:    Math.min(...allReadings),
      max_mmol:    Math.max(...allReadings),
      in_range:    allReadings.filter(v => v >= 3.9 && v <= 7.8).length,
      below_range: allReadings.filter(v => v < 3.9).length,
      above_range: allReadings.filter(v => v > 7.8).length,
    } : null;

    return success(res, {
      logs,
      stats,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error({ err }, 'getBloodSugarLogs error');
    throw err;
  }
}

// Blood sugar risk classification (WHO guidelines)
function classifyBloodSugar(mmol, logType) {
  const isFasting = logType === 'FASTING';
  if (mmol < 3.9) return { level: 'LOW',     message: '⚠️ Hypoglycaemia — consume fast-acting glucose immediately' };
  if (isFasting) {
    if (mmol <= 5.5)  return { level: 'NORMAL',  message: '✅ Normal fasting glucose' };
    if (mmol <= 7.0)  return { level: 'ELEVATED', message: '🟡 Pre-diabetic range — consult doctor' };
    return               { level: 'HIGH',    message: '🔴 Diabetic range — medical attention recommended' };
  }
  // Post-meal / random
  if (mmol <= 7.8)  return { level: 'NORMAL',  message: '✅ Normal post-meal glucose' };
  if (mmol <= 11.0) return { level: 'ELEVATED', message: '🟡 Elevated — review meal composition' };
  return               { level: 'HIGH',    message: '🔴 High — consult your doctor' };
}

// ─────────────────────────────────────────────────────────────────────────────
// CYCLE TRACKING
// ─────────────────────────────────────────────────────────────────────────────

// ── LOG PERIOD ────────────────────────────────────────────────────────────────
async function logPeriod(req, res) {
  try {
    const userId = req.user.id;
    const {
      period_start, period_end, cycle_length, period_length,
      flow_intensity, symptoms, mood, notes,
    } = req.body;

    const entry = await prisma.cycleTracking.create({
      data: {
        user_id:        userId,
        period_start:   new Date(period_start),
        period_end:     period_end ? new Date(period_end) : null,
        cycle_length:   cycle_length ? Number(cycle_length) : null,
        period_length:  period_length ? Number(period_length) : null,
        flow_intensity: flow_intensity?.toUpperCase() || null,
        symptoms:       Array.isArray(symptoms) ? symptoms : (symptoms ? [symptoms] : []),
        mood:           mood || null,
        notes:          notes || null,
      },
    });

    return created(res, entry, 'Cycle entry logged');
  } catch (err) {
    logger.error({ err }, 'logPeriod error');
    throw err;
  }
}

// ── GET CYCLE HISTORY + PREDICTIONS ──────────────────────────────────────────
async function getCycleHistory(req, res) {
  try {
    const userId = req.user.id;
    const { months = 6 } = req.query;

    const since = new Date();
    since.setMonth(since.getMonth() - Number(months));

    const cycles = await prisma.cycleTracking.findMany({
      where:   { user_id: userId, period_start: { gte: since } },
      orderBy: { period_start: 'desc' },
    });

    // Compute average cycle length from data
    const lengths = cycles
      .filter(c => c.cycle_length)
      .map(c => c.cycle_length);
    const avgCycleLen = lengths.length
      ? Math.round(lengths.reduce((s, v) => s + v, 0) / lengths.length)
      : 28;

    // Predict next 3 periods from last logged period_start
    let predictions = [];
    if (cycles.length > 0) {
      const lastStart = new Date(cycles[0].period_start);
      predictions = [1, 2, 3].map(n => {
        const d = new Date(lastStart);
        d.setDate(d.getDate() + avgCycleLen * n);
        return {
          predicted_start: d.toISOString().split('T')[0],
          predicted_end:   new Date(d.getTime() + 5 * 24 * 3600_000).toISOString().split('T')[0],
          cycle_number:    n,
        };
      });
    }

    // Common symptoms frequency
    const allSymptoms = cycles.flatMap(c => c.symptoms);
    const symFreq = allSymptoms.reduce((acc, s) => { acc[s] = (acc[s] || 0) + 1; return acc; }, {});

    return success(res, {
      cycles,
      stats: {
        avg_cycle_length:  avgCycleLen,
        avg_period_length: cycles.filter(c => c.period_length).length
          ? Math.round(cycles.filter(c => c.period_length).reduce((s, c) => s + c.period_length, 0) / cycles.filter(c => c.period_length).length)
          : null,
        total_logged: cycles.length,
        top_symptoms: Object.entries(symFreq)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([symptom, count]) => ({ symptom, count })),
      },
      predictions,
    });
  } catch (err) {
    logger.error({ err }, 'getCycleHistory error');
    throw err;
  }
}

// ── UPDATE CYCLE ENTRY ────────────────────────────────────────────────────────
async function updateCycleEntry(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const updates = req.body;

    const entry = await prisma.cycleTracking.findFirst({ where: { id, user_id: userId } });
    if (!entry) return notFound(res, 'Cycle entry not found');

    const updated = await prisma.cycleTracking.update({
      where: { id },
      data: {
        period_end:    updates.period_end    ? new Date(updates.period_end)    : entry.period_end,
        flow_intensity: updates.flow_intensity?.toUpperCase() || entry.flow_intensity,
        symptoms:      updates.symptoms      || entry.symptoms,
        mood:          updates.mood          ?? entry.mood,
        notes:         updates.notes         ?? entry.notes,
        cycle_length:  updates.cycle_length  ? Number(updates.cycle_length)   : entry.cycle_length,
        period_length: updates.period_length ? Number(updates.period_length)  : entry.period_length,
      },
    });

    return success(res, updated, 'Cycle entry updated');
  } catch (err) {
    logger.error({ err }, 'updateCycleEntry error');
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-CITY KITCHEN (Delhi 2nd location)
// ─────────────────────────────────────────────────────────────────────────────

// Returns delivery zones + kitchens for a given city — used by frontend city switcher
async function getKitchensByCity(req, res) {
  try {
    const { city = 'bangalore' } = req.params;
    const kitchens = await prisma.cloudKitchen.findMany({
      where:   { city: { mode: 'insensitive', contains: city }, is_active: true },
      select:  {
        id: true, name: true, city: true, address: true, lat: true, lng: true,
        phone: true, opens_at: true, closes_at: true, delivery_zones: true,
        rating: true,
        _count: { select: { orders: true } },
      },
    });
    return success(res, { city, kitchens });
  } catch (err) {
    logger.error({ err }, 'getKitchensByCity error');
    throw err;
  }
}

// ── DELIVERY ROUTE OPTIMISATION ───────────────────────────────────────────────
// Batches pending deliveries and returns an ordered list based on proximity
async function getOptimisedRoute(req, res) {
  try {
    const { kitchen_id } = req.params;

    const kitchen = await prisma.cloudKitchen.findUnique({
      where:  { id: kitchen_id },
      select: { lat: true, lng: true, name: true },
    });
    if (!kitchen) return notFound(res, 'Kitchen not found');

    // Get today's OUT_FOR_DELIVERY orders for this kitchen
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

    const deliveries = await prisma.delivery.findMany({
      where: {
        status: { in: ['SCHEDULED', 'PICKED_UP'] },
        created_at: { gte: todayStart },
        order: { kitchen_id },
      },
      include: {
        order: {
          include: {
            user: { select: { name: true, phone: true } },
            items: { include: { meal: { select: { name: true } } } },
          },
        },
      },
    });

    if (!deliveries.length) {
      return success(res, { stops: [], message: 'No pending deliveries today' });
    }

    // Greedy nearest-neighbour route starting from kitchen
    const stops = greedyRoute(
      { lat: kitchen.lat, lng: kitchen.lng },
      deliveries.map(d => ({
        id:      d.id,
        order_id: d.order_id,
        lat:     d.delivery_lat || 12.9 + Math.random() * 0.1,  // fallback placeholder
        lng:     d.delivery_lng || 77.5 + Math.random() * 0.1,
        address: d.delivery_address,
        customer: d.order.user.name,
        phone:   d.order.user.phone,
        items:   d.order.items.map(i => i.meal.name).join(', '),
        status:  d.status,
        estimated_min: null,
      })),
    );

    // Estimate cumulative travel time (approx 3 min/km + 2 min stop)
    let cumMin = 0;
    stops.forEach((s, i) => {
      const prev = i === 0 ? { lat: kitchen.lat, lng: kitchen.lng } : stops[i - 1];
      const dist = haversine(prev.lat, prev.lng, s.lat, s.lng);
      cumMin += Math.round(dist * 3 + 2);
      s.estimated_min = cumMin;
      s.distance_km   = Math.round(dist * 10) / 10;
    });

    return success(res, {
      kitchen_name:      kitchen.name,
      total_stops:       stops.length,
      estimated_total_min: cumMin,
      route:             stops,
    });
  } catch (err) {
    logger.error({ err }, 'getOptimisedRoute error');
    throw err;
  }
}

// Greedy nearest-neighbour
function greedyRoute(origin, points) {
  const remaining = [...points];
  const route     = [];
  let current     = origin;

  while (remaining.length) {
    let minIdx = 0;
    let minDist = Infinity;
    remaining.forEach((p, i) => {
      const d = haversine(current.lat, current.lng, p.lat, p.lng);
      if (d < minDist) { minDist = d; minIdx = i; }
    });
    const next = remaining.splice(minIdx, 1)[0];
    route.push(next);
    current = next;
  }
  return route;
}

// Haversine distance in km
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

module.exports = {
  // Programs
  listPrograms, getProgram, enrollProgram, myEnrollments, advanceWeek, updateEnrollmentStatus,
  // Blood sugar
  logBloodSugar, getBloodSugarLogs,
  // Cycle
  logPeriod, getCycleHistory, updateCycleEntry,
  // Multi-city
  getKitchensByCity, getOptimisedRoute,
};
