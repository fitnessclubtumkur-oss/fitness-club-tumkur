// src/controllers/classes.controller.js
// Phase 3A — Live & Recorded Workout Classes
// GET /api/classes           — list catalog (filter: type, level, live, free)
// GET /api/classes/live      — today's live schedule
// GET /api/classes/:id       — single class detail
// POST /api/classes          — admin: create class
// POST /api/classes/:id/book — book a class (or mark attended for recorded)
// POST /api/classes/:id/complete — mark attended + auto-log workout
// GET  /api/classes/my       — user's booked/attended classes
// POST /api/classes/:id/rate — leave rating + review
'use strict';

const prisma  = require('../config/db');
const { success, created, error, notFound } = require('../utils/response');
const logger  = require('../utils/logger');

// ── MET values for auto-log ───────────────────────────────────────────────────
const CLASS_MET = {
  YOGA:       3.0,
  HIIT:       8.0,
  STRENGTH:   5.0,
  CARDIO:     7.0,
  MEDITATION: 1.5,
  DANCE:      6.5,
  PILATES:    3.5,
  ZUMBA:      6.5,
  STRETCHING: 2.5,
};

// ── LIST CLASSES ──────────────────────────────────────────────────────────────
async function listClasses(req, res) {
  try {
    const {
      type, level, is_live, free, page = 1, limit = 20,
    } = req.query;

    const where = { is_active: true };
    if (type)    where.class_type = type.toUpperCase();
    if (level)   where.level      = level.toUpperCase();
    if (is_live !== undefined) where.is_live = is_live === 'true';
    if (free === 'true')       where.is_free = true;

    const [classes, total] = await Promise.all([
      prisma.workoutClass.findMany({
        where,
        orderBy: [{ is_live: 'desc' }, { scheduled_at: 'asc' }, { created_at: 'desc' }],
        skip:  (page - 1) * Number(limit),
        take:  Number(limit),
        include: {
          _count: { select: { bookings: true } },
        },
      }),
      prisma.workoutClass.count({ where }),
    ]);

    // attach booking count and spots_left for live classes
    const enriched = classes.map(c => ({
      ...c,
      bookings_count: c._count.bookings,
      spots_left: c.max_participants
        ? Math.max(0, c.max_participants - c._count.bookings)
        : null,
      _count: undefined,
    }));

    return success(res, {
      classes:    enriched,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error({ err }, 'listClasses error');
    throw err;
  }
}

// ── TODAY'S LIVE SCHEDULE ─────────────────────────────────────────────────────
async function getLiveSchedule(req, res) {
  try {
    const now     = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999);

    const classes = await prisma.workoutClass.findMany({
      where: {
        is_live:  true,
        is_active: true,
        scheduled_at: { gte: todayStart, lte: todayEnd },
      },
      orderBy: { scheduled_at: 'asc' },
      include: { _count: { select: { bookings: true } } },
    });

    const enriched = classes.map(c => {
      const start    = new Date(c.scheduled_at);
      const end      = new Date(start.getTime() + c.duration_min * 60_000);
      const isOngoing = now >= start && now <= end;
      return {
        ...c,
        bookings_count: c._count.bookings,
        spots_left:     c.max_participants ? Math.max(0, c.max_participants - c._count.bookings) : null,
        is_ongoing:     isOngoing,
        starts_in_min:  isOngoing ? 0 : Math.max(0, Math.round((start - now) / 60_000)),
        _count: undefined,
      };
    });

    // Also include default daily schedule even if no DB rows (seed fallback)
    const fallback = enriched.length === 0
      ? [
          { id: 'daily-yoga', title: '🧘 Morning Yoga', class_type: 'YOGA', level: 'ALL_LEVELS',
            duration_min: 45, instructor: 'Priya Sharma', scheduled_at: _todayAt(6, 0),
            is_live: true, is_ongoing: false, starts_in_min: _minUntil(6, 0, now),
            live_url: null, is_free: true, _fallback: true },
          { id: 'daily-hiit', title: '🔥 Evening HIIT', class_type: 'HIIT', level: 'INTERMEDIATE',
            duration_min: 30, instructor: 'Rohit Nair', scheduled_at: _todayAt(18, 30),
            is_live: true, is_ongoing: false, starts_in_min: _minUntil(18, 30, now),
            live_url: null, is_free: true, _fallback: true },
        ]
      : enriched;

    return success(res, { date: todayStart.toISOString().split('T')[0], classes: fallback });
  } catch (err) {
    logger.error({ err }, 'getLiveSchedule error');
    throw err;
  }
}

// helper: today at H:M (IST = UTC+5:30)
function _todayAt(h, m) {
  const d = new Date();
  d.setHours(h - 5, m - 30, 0, 0); // rough IST→UTC
  return d;
}
function _minUntil(h, m, now) {
  const t = _todayAt(h, m);
  return Math.max(0, Math.round((t - now) / 60_000));
}

// ── GET SINGLE CLASS ──────────────────────────────────────────────────────────
async function getClass(req, res) {
  try {
    const { id } = req.params;
    const cls = await prisma.workoutClass.findUnique({
      where: { id },
      include: {
        _count: { select: { bookings: true } },
        bookings: {
          where: { status: 'ATTENDED', rating: { not: null } },
          select: { rating: true, review: true, booked_at: true },
          orderBy: { booked_at: 'desc' },
          take: 10,
        },
      },
    });
    if (!cls) return notFound(res, 'Class not found');

    const avgRating = cls.bookings.length
      ? cls.bookings.reduce((s, b) => s + b.rating, 0) / cls.bookings.length
      : null;

    return success(res, {
      ...cls,
      bookings_count: cls._count.bookings,
      spots_left:     cls.max_participants ? Math.max(0, cls.max_participants - cls._count.bookings) : null,
      avg_rating:     avgRating ? Math.round(avgRating * 10) / 10 : null,
      reviews:        cls.bookings,
      _count: undefined,
    });
  } catch (err) {
    logger.error({ err }, 'getClass error');
    throw err;
  }
}

// ── ADMIN: CREATE CLASS ───────────────────────────────────────────────────────
async function createClass(req, res) {
  try {
    const {
      title, description, instructor, class_type, level, duration_min,
      calories_burn, thumbnail_url, video_url, is_live, scheduled_at,
      live_url, max_participants, tags, is_free, price_inr, met_value,
    } = req.body;

    const cls = await prisma.workoutClass.create({
      data: {
        title, description, instructor,
        class_type: class_type.toUpperCase(),
        level:      (level || 'ALL_LEVELS').toUpperCase(),
        duration_min: Number(duration_min),
        calories_burn: calories_burn ? Number(calories_burn) : null,
        thumbnail_url, video_url,
        is_live:     Boolean(is_live),
        scheduled_at: scheduled_at ? new Date(scheduled_at) : null,
        live_url,
        max_participants: max_participants ? Number(max_participants) : null,
        tags:  Array.isArray(tags) ? tags : (tags ? tags.split(',').map(t => t.trim()) : []),
        is_free: is_free !== false,
        price_inr: price_inr ? Number(price_inr) : null,
        met_value: met_value ? Number(met_value) : (CLASS_MET[class_type?.toUpperCase()] || null),
      },
    });

    return created(res, cls, 'Class created');
  } catch (err) {
    logger.error({ err }, 'createClass error');
    throw err;
  }
}

// ── BOOK / REGISTER FOR CLASS ─────────────────────────────────────────────────
async function bookClass(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const cls = await prisma.workoutClass.findUnique({
      where: { id },
      include: { _count: { select: { bookings: true } } },
    });
    if (!cls || !cls.is_active) return notFound(res, 'Class not found');

    // Check capacity for live classes
    if (cls.is_live && cls.max_participants) {
      if (cls._count.bookings >= cls.max_participants) {
        return error(res, 'Class is full. No spots available.', 409);
      }
    }

    // Upsert booking
    const existing = await prisma.classBooking.findUnique({
      where: { user_id_class_id: { user_id: userId, class_id: id } },
    });
    if (existing && existing.status === 'BOOKED') {
      return error(res, 'You have already booked this class', 409);
    }

    const booking = existing
      ? await prisma.classBooking.update({ where: { id: existing.id }, data: { status: 'BOOKED' } })
      : await prisma.classBooking.create({
          data: { user_id: userId, class_id: id, status: 'BOOKED' },
        });

    return created(res, {
      booking_id:     booking.id,
      class_title:    cls.title,
      scheduled_at:   cls.scheduled_at,
      live_url:       cls.live_url,
      duration_min:   cls.duration_min,
    }, 'Class booked successfully');
  } catch (err) {
    logger.error({ err }, 'bookClass error');
    throw err;
  }
}

// ── COMPLETE CLASS + AUTO-LOG WORKOUT ─────────────────────────────────────────
async function completeClass(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { date, notes } = req.body;

    const cls = await prisma.workoutClass.findUnique({ where: { id } });
    if (!cls) return notFound(res, 'Class not found');

    // Ensure booking exists (create if direct completion e.g. for recorded)
    let booking = await prisma.classBooking.findUnique({
      where: { user_id_class_id: { user_id: userId, class_id: id } },
    });
    if (!booking) {
      booking = await prisma.classBooking.create({
        data: { user_id: userId, class_id: id, status: 'BOOKED' },
      });
    }
    if (booking.status === 'ATTENDED') {
      return error(res, 'Class already marked as completed', 409);
    }

    // Auto-log workout
    const profile = await prisma.fitnessProfile.findUnique({ where: { user_id: userId } });
    const weightKg = profile?.weight_kg || 70;
    const met      = cls.met_value || CLASS_MET[cls.class_type] || 5.0;
    const calories = Math.round(met * weightKg * (cls.duration_min / 60));

    const workout = await prisma.workout.create({
      data: {
        user_id:      userId,
        workout_type: mapClassTypeToWorkout(cls.class_type),
        duration_min: cls.duration_min,
        calories_burned: calories,
        notes:        notes || `${cls.title} — FitFuel Live Class`,
        logged_at:    date ? new Date(date) : new Date(),
        metadata:     { source: 'live_class', class_id: id, class_title: cls.title },
      },
    });

    // Update booking
    await prisma.classBooking.update({
      where: { id: booking.id },
      data: {
        status:      'ATTENDED',
        auto_logged: true,
        workout_id:  workout.id,
        attended_at: new Date(),
      },
    });

    // Award points
    await _awardClassPoints(userId, cls.class_type);

    return success(res, {
      workout_id:      workout.id,
      calories_burned: calories,
      duration_min:    cls.duration_min,
      class_title:     cls.title,
      auto_logged:     true,
    }, `🎉 ${cls.title} completed! ${calories} kcal burned and workout logged.`);
  } catch (err) {
    logger.error({ err }, 'completeClass error');
    throw err;
  }
}

function mapClassTypeToWorkout(classType) {
  const map = {
    YOGA: 'YOGA', HIIT: 'CARDIO', STRENGTH: 'RESISTANCE',
    CARDIO: 'CARDIO', MEDITATION: 'YOGA', DANCE: 'AEROBICS',
    PILATES: 'YOGA', ZUMBA: 'AEROBICS', STRETCHING: 'YOGA',
  };
  return map[classType] || 'CARDIO';
}

async function _awardClassPoints(userId, classType) {
  const pts = classType === 'HIIT' ? 30 : classType === 'YOGA' ? 20 : 25;
  try {
    await prisma.userPoints.upsert({
      where:  { user_id: userId },
      create: { user_id: userId, total_points: pts, weekly_points: pts, monthly_points: pts },
      update: { total_points: { increment: pts }, weekly_points: { increment: pts }, monthly_points: { increment: pts } },
    });
  } catch (_) { /* non-critical */ }
}

// ── MY CLASSES ────────────────────────────────────────────────────────────────
async function myClasses(req, res) {
  try {
    const userId = req.user.id;
    const { status, page = 1, limit = 20 } = req.query;
    const where = { user_id: userId };
    if (status) where.status = status.toUpperCase();

    const [bookings, total] = await Promise.all([
      prisma.classBooking.findMany({
        where,
        orderBy: { booked_at: 'desc' },
        skip: (page - 1) * Number(limit),
        take: Number(limit),
        include: { workout_class: true },
      }),
      prisma.classBooking.count({ where }),
    ]);

    const attended = bookings.filter(b => b.status === 'ATTENDED').length;

    return success(res, {
      bookings,
      stats: { total_booked: total, attended },
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error({ err }, 'myClasses error');
    throw err;
  }
}

// ── RATE CLASS ────────────────────────────────────────────────────────────────
async function rateClass(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { rating, review } = req.body;

    if (!rating || rating < 1 || rating > 5) return error(res, 'Rating must be 1–5');

    const booking = await prisma.classBooking.findUnique({
      where: { user_id_class_id: { user_id: userId, class_id: id } },
    });
    if (!booking)          return notFound(res, 'You have not booked this class');
    if (booking.status !== 'ATTENDED') return error(res, 'Complete the class before rating');

    await prisma.classBooking.update({
      where: { id: booking.id },
      data:  { rating: Number(rating), review: review || null },
    });

    return success(res, { rated: true }, 'Rating saved');
  } catch (err) {
    logger.error({ err }, 'rateClass error');
    throw err;
  }
}

// ── CANCEL BOOKING ────────────────────────────────────────────────────────────
async function cancelBooking(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const booking = await prisma.classBooking.findUnique({
      where: { user_id_class_id: { user_id: userId, class_id: id } },
    });
    if (!booking) return notFound(res, 'Booking not found');
    if (booking.status === 'ATTENDED') return error(res, 'Cannot cancel a completed class');

    await prisma.classBooking.update({
      where: { id: booking.id },
      data:  { status: 'CANCELLED' },
    });

    return success(res, { cancelled: true }, 'Booking cancelled');
  } catch (err) {
    logger.error({ err }, 'cancelBooking error');
    throw err;
  }
}

module.exports = {
  listClasses, getLiveSchedule, getClass, createClass,
  bookClass, completeClass, myClasses, rateClass, cancelBooking,
};
