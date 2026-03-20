// src/controllers/gamification.controller.js
// Phase 2A — Badges, Points, Achievements, Challenges, Leaderboards
'use strict';

const prisma = require('../config/db');
const { success, created, notFound, error } = require('../utils/response');
const logger = require('../utils/logger');

// ─── ACHIEVEMENT ENGINE ───────────────────────────────────────────────────────
// Evaluates all badge conditions for a user and awards new ones
async function checkAndAwardAchievements(userId) {
  try {
    const [profile, workouts, meals, orders, friends, achievements] = await Promise.all([
      prisma.fitnessProfile.findUnique({ where: { user_id: userId } }),
      prisma.workout.findMany({ where: { user_id: userId }, orderBy: { date: 'desc' } }),
      prisma.mealItem.findMany({ where: { user_id: userId } }),
      prisma.order.findMany({ where: { user_id: userId, status: 'DELIVERED' } }),
      prisma.friend.findMany({ where: { requester_id: userId, is_accepted: true } }),
      prisma.achievement.findMany(),
    ]);

    const earned = await prisma.userAchievement.findMany({
      where: { user_id: userId },
      select: { achievement_id: true },
    });
    const earnedIds = new Set(earned.map(e => e.achievement_id));

    // Compute metrics
    const metrics = computeMetrics(workouts, meals, orders, friends);

    const newlyEarned = [];
    for (const ach of achievements) {
      if (earnedIds.has(ach.id)) continue;
      if (evaluateCondition(ach.condition, metrics)) {
        const ua = await prisma.userAchievement.create({
          data: { user_id: userId, achievement_id: ach.id },
        });
        // Award points
        await prisma.userPoints.upsert({
          where: { user_id: userId },
          create: { user_id: userId, total_points: ach.points, weekly_points: ach.points, monthly_points: ach.points },
          update: {
            total_points:   { increment: ach.points },
            weekly_points:  { increment: ach.points },
            monthly_points: { increment: ach.points },
          },
        });
        newlyEarned.push({ ...ach, earned_at: ua.earned_at });
      }
    }

    return newlyEarned;
  } catch (err) {
    logger.error({ err }, 'Achievement check error');
    return [];
  }
}

function computeMetrics(workouts, meals, orders, friends) {
  const totalRunKm = workouts
    .filter(w => w.type === 'RUNNING')
    .reduce((s, w) => s + (w.metadata?.distance_km || 0), 0);

  const totalTrekkingKm = workouts
    .filter(w => w.type === 'TREKKING')
    .reduce((s, w) => s + (w.metadata?.distance_km || 0), 0);

  const yogaSessions = workouts.filter(w => w.type === 'YOGA').length;

  // Consecutive workout days
  const workoutDates = [...new Set(workouts.map(w => w.date?.toISOString().split('T')[0]))].sort().reverse();
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < workoutDates.length; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (workoutDates[i] === d.toISOString().split('T')[0]) streak++;
    else break;
  }

  return {
    workout_count:              workouts.length,
    total_run_distance_km:      totalRunKm,
    trekking_distance_km:       totalTrekkingKm,
    yoga_sessions:              yogaSessions,
    consecutive_workout_days:   streak,
    meals_logged:               meals.length,
    kitchen_orders:             orders.length,
    friends_count:              friends.length,
    activity_streak:            streak,
  };
}

function evaluateCondition(condition, metrics) {
  if (!condition || !condition.metric) return false;
  const val = metrics[condition.metric] ?? 0;
  switch (condition.operator) {
    case 'gte': return val >= condition.value;
    case 'gt':  return val >  condition.value;
    case 'lte': return val <= condition.value;
    case 'eq':  return val === condition.value;
    default:    return false;
  }
}

// ─── GET USER ACHIEVEMENTS ────────────────────────────────────────────────────
async function getUserAchievements(req, res) {
  try {
    const userId = req.user.id;

    const [earned, all, points] = await Promise.all([
      prisma.userAchievement.findMany({
        where: { user_id: userId },
        include: { achievement: true },
        orderBy: { earned_at: 'desc' },
      }),
      prisma.achievement.findMany({ orderBy: [{ category: 'asc' }, { points: 'asc' }] }),
      prisma.userPoints.findUnique({ where: { user_id: userId } }),
    ]);

    const earnedIds = new Set(earned.map(e => e.achievement_id));

    const grouped = {
      FITNESS:   [],
      NUTRITION: [],
      KITCHEN:   [],
      SOCIAL:    [],
      STREAK:    [],
    };

    for (const ach of all) {
      const isEarned = earnedIds.has(ach.id);
      const earnedEntry = earned.find(e => e.achievement_id === ach.id);
      const entry = {
        ...ach,
        earned: isEarned,
        earned_at: earnedEntry?.earned_at || null,
      };
      if (grouped[ach.category]) grouped[ach.category].push(entry);
    }

    return success(res, {
      earned_count: earned.length,
      total_count:  all.length,
      points:       points || { total_points: 0, weekly_points: 0, monthly_points: 0 },
      achievements: grouped,
    });
  } catch (err) {
    logger.error({ err }, 'Get achievements error');
    throw err;
  }
}

// ─── CHECK ACHIEVEMENTS (trigger manually or after actions) ──────────────────
async function triggerAchievementCheck(req, res) {
  try {
    const newlyEarned = await checkAndAwardAchievements(req.user.id);
    return success(res, {
      newly_earned: newlyEarned,
      count: newlyEarned.length,
      message: newlyEarned.length
        ? `🏆 You earned ${newlyEarned.length} new badge(s)!`
        : 'No new badges yet — keep going!',
    });
  } catch (err) {
    logger.error({ err }, 'Trigger achievement check error');
    throw err;
  }
}

// ─── LEADERBOARDS ─────────────────────────────────────────────────────────────
async function getLeaderboard(req, res) {
  try {
    const { type = 'MOST_ACTIVE', period = 'MONTHLY', page = 1, limit = 20 } = req.query;
    const userId = req.user.id;

    const now = new Date();
    const periodKey = period === 'WEEKLY'
      ? `${now.getFullYear()}-W${getWeekNumber(now)}`
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Compute and upsert leaderboard for current period
    await computeLeaderboard(type, period, periodKey);

    const [entries, total, myEntry] = await Promise.all([
      prisma.leaderboard.findMany({
        where: { type, period, period_key: periodKey },
        include: { user: { select: { id: true, name: true, avatar_url: true } } },
        orderBy: { rank: 'asc' },
        skip:  (page - 1) * limit,
        take:  parseInt(limit),
      }),
      prisma.leaderboard.count({ where: { type, period, period_key: periodKey } }),
      prisma.leaderboard.findFirst({
        where: { type, period, period_key: periodKey, user_id: userId },
      }),
    ]);

    return success(res, {
      type, period, period_key: periodKey,
      your_rank:   myEntry?.rank || null,
      your_metric: myEntry?.metric_value || 0,
      entries, total,
      page: parseInt(page),
    });
  } catch (err) {
    logger.error({ err }, 'Get leaderboard error');
    throw err;
  }
}

async function computeLeaderboard(type, period, periodKey) {
  const now = new Date();
  let startDate = new Date();

  if (period === 'WEEKLY')  startDate.setDate(now.getDate() - 7);
  if (period === 'MONTHLY') startDate.setMonth(now.getMonth() - 1);
  if (period === 'ALL_TIME') startDate = new Date('2020-01-01');

  try {
    let rows = [];

    switch (type) {
      case 'MOST_ACTIVE': {
        const raw = await prisma.workout.groupBy({
          by: ['user_id'],
          where: { date: { gte: startDate } },
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
        });
        rows = raw.map((r, i) => ({ user_id: r.user_id, rank: i + 1, metric_value: r._count.id }));
        break;
      }
      case 'POINTS': {
        const pts = await prisma.userPoints.findMany({
          orderBy: period === 'WEEKLY' ? { weekly_points: 'desc' } : { monthly_points: 'desc' },
          take: 100,
        });
        rows = pts.map((p, i) => ({
          user_id: p.user_id,
          rank: i + 1,
          metric_value: period === 'WEEKLY' ? p.weekly_points : p.monthly_points,
        }));
        break;
      }
      case 'MACRO_ADHERENCE': {
        const goals = await prisma.userGoal.findMany({ where: { is_active: true } });
        const userIds = goals.map(g => g.user_id);
        const rows2 = [];
        for (const g of goals) {
          const days = await prisma.dailySummary.count({
            where: { user_id: g.user_id, date: { gte: startDate }, total_protein_g: { gte: g.target_protein_g * 0.9 } },
          });
          rows2.push({ user_id: g.user_id, rank: 0, metric_value: days });
        }
        rows2.sort((a, b) => b.metric_value - a.metric_value);
        rows2.forEach((r, i) => r.rank = i + 1);
        rows = rows2;
        break;
      }
    }

    // Upsert into leaderboard table
    for (const row of rows.slice(0, 200)) {
      await prisma.leaderboard.upsert({
        where: { type_period_period_key_user_id: { type, period, period_key: periodKey, user_id: row.user_id } },
        create: { type, period, period_key: periodKey, ...row },
        update: { rank: row.rank, metric_value: row.metric_value },
      });
    }
  } catch (err) {
    logger.warn({ err }, 'Leaderboard compute error');
  }
}

// ─── CHALLENGES ───────────────────────────────────────────────────────────────
async function listChallenges(req, res) {
  try {
    const now = new Date();
    const challenges = await prisma.challenge.findMany({
      where: { ends_at: { gte: now } },
      include: {
        participants: {
          where: { user_id: req.user.id },
          take: 1,
        },
        _count: { select: { participants: true } },
      },
      orderBy: { ends_at: 'asc' },
    });

    return success(res, {
      challenges: challenges.map(c => ({
        ...c,
        joined:    c.participants.length > 0,
        my_progress: c.participants[0]?.progress || 0,
        participant_count: c._count.participants,
      })),
    });
  } catch (err) {
    logger.error({ err }, 'List challenges error');
    throw err;
  }
}

async function joinChallenge(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const challenge = await prisma.challenge.findUnique({ where: { id } });
    if (!challenge) return notFound(res, 'Challenge not found');
    if (new Date() > challenge.ends_at) return error(res, 'Challenge has ended');

    const existing = await prisma.challengeParticipant.findFirst({
      where: { challenge_id: id, user_id: userId },
    });
    if (existing) return error(res, 'Already joined this challenge');

    const participant = await prisma.challengeParticipant.create({
      data: { challenge_id: id, user_id: userId, progress: 0 },
    });

    return created(res, { participant }, 'Joined challenge! 💪');
  } catch (err) {
    logger.error({ err }, 'Join challenge error');
    throw err;
  }
}

async function getMyChallenges(req, res) {
  try {
    const userId = req.user.id;
    const participants = await prisma.challengeParticipant.findMany({
      where: { user_id: userId },
      include: { challenge: true },
      orderBy: { joined_at: 'desc' },
    });

    // Sync progress for active challenges
    for (const p of participants) {
      if (!p.completed && new Date() <= p.challenge.ends_at) {
        const progress = await computeChallengeProgress(userId, p.challenge);
        if (progress !== p.progress) {
          await prisma.challengeParticipant.update({
            where: { id: p.id },
            data: { progress, completed: progress >= p.challenge.target_value },
          });
          p.progress = progress;
        }
      }
    }

    return success(res, { challenges: participants });
  } catch (err) {
    logger.error({ err }, 'Get my challenges error');
    throw err;
  }
}

async function computeChallengeProgress(userId, challenge) {
  try {
    switch (challenge.target_type) {
      case 'DISTANCE_KM': {
        const r = await prisma.workout.aggregate({
          where: { user_id: userId, date: { gte: challenge.starts_at, lte: challenge.ends_at } },
          _sum: { metadata: false },
        });
        // Aggregate running distance from metadata JSON
        const ws = await prisma.workout.findMany({
          where: { user_id: userId, type: 'RUNNING', date: { gte: challenge.starts_at } },
        });
        return ws.reduce((s, w) => s + (w.metadata?.distance_km || 0), 0);
      }
      case 'WORKOUT_COUNT': {
        return await prisma.workout.count({
          where: { user_id: userId, date: { gte: challenge.starts_at, lte: challenge.ends_at } },
        });
      }
      case 'CALORIE_BURN': {
        const r = await prisma.workout.aggregate({
          where: { user_id: userId, date: { gte: challenge.starts_at, lte: challenge.ends_at } },
          _sum: { calories_burned: true },
        });
        return r._sum.calories_burned || 0;
      }
      default: return 0;
    }
  } catch { return 0; }
}

async function createChallenge(req, res) {
  try {
    const { name, description, target_type, target_value, starts_at, ends_at, club_id } = req.body;

    const challenge = await prisma.challenge.create({
      data: { name, description, target_type, target_value, starts_at: new Date(starts_at), ends_at: new Date(ends_at), club_id },
    });

    // Auto-join creator
    await prisma.challengeParticipant.create({
      data: { challenge_id: challenge.id, user_id: req.user.id, progress: 0 },
    });

    return created(res, { challenge }, 'Challenge created!');
  } catch (err) {
    logger.error({ err }, 'Create challenge error');
    throw err;
  }
}

// ─── FRIENDS / SOCIAL ─────────────────────────────────────────────────────────
async function sendFriendRequest(req, res) {
  try {
    const { receiver_id } = req.body;
    const requesterId = req.user.id;

    if (requesterId === receiver_id) return error(res, 'Cannot add yourself');

    const existing = await prisma.friend.findFirst({
      where: { OR: [{ requester_id: requesterId, receiver_id }, { requester_id: receiver_id, receiver_id: requesterId }] },
    });
    if (existing) return error(res, existing.is_accepted ? 'Already friends' : 'Request already sent');

    const receiver = await prisma.user.findUnique({ where: { id: receiver_id }, select: { id: true, name: true } });
    if (!receiver) return notFound(res, 'User not found');

    const friendship = await prisma.friend.create({
      data: { requester_id: requesterId, receiver_id, is_accepted: false },
    });

    return created(res, { friendship }, `Friend request sent to ${receiver.name}`);
  } catch (err) {
    logger.error({ err }, 'Send friend request error');
    throw err;
  }
}

async function acceptFriendRequest(req, res) {
  try {
    const { id } = req.params;
    const friendship = await prisma.friend.findFirst({
      where: { id, receiver_id: req.user.id, is_accepted: false },
    });
    if (!friendship) return notFound(res, 'Friend request not found');

    const updated = await prisma.friend.update({
      where: { id },
      data: { is_accepted: true },
    });

    // Award "First Friend" achievement
    await checkAndAwardAchievements(req.user.id);

    return success(res, { friendship: updated }, 'Friend request accepted! 🤝');
  } catch (err) {
    logger.error({ err }, 'Accept friend request error');
    throw err;
  }
}

async function getFriends(req, res) {
  try {
    const userId = req.user.id;
    const friends = await prisma.friend.findMany({
      where: { OR: [{ requester_id: userId }, { receiver_id: userId }], is_accepted: true },
      include: {
        requester: { select: { id: true, name: true, avatar_url: true } },
        receiver:  { select: { id: true, name: true, avatar_url: true } },
      },
    });

    const pending = await prisma.friend.findMany({
      where: { receiver_id: userId, is_accepted: false },
      include: { requester: { select: { id: true, name: true, avatar_url: true } } },
    });

    const friendList = friends.map(f => ({
      friendship_id: f.id,
      friend: f.requester_id === userId ? f.receiver : f.requester,
    }));

    return success(res, { friends: friendList, pending_requests: pending, friend_count: friendList.length });
  } catch (err) {
    logger.error({ err }, 'Get friends error');
    throw err;
  }
}

async function searchUsers(req, res) {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return error(res, 'Search query must be at least 2 characters');

    const users = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: req.user.id } },
          { OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
          ]},
        ],
      },
      select: { id: true, name: true, avatar_url: true },
      take: 20,
    });

    return success(res, { users });
  } catch (err) {
    logger.error({ err }, 'Search users error');
    throw err;
  }
}

async function sendKudos(req, res) {
  try {
    const { receiver_id, workout_id, message } = req.body;
    const senderId = req.user.id;

    const receiver = await prisma.user.findUnique({ where: { id: receiver_id }, select: { id: true, name: true } });
    if (!receiver) return notFound(res, 'User not found');

    const kudos = await prisma.kudos.create({
      data: { sender_id: senderId, receiver_id, workout_id, message },
    });

    return created(res, { kudos }, `Kudos sent to ${receiver.name}! 👏`);
  } catch (err) {
    logger.error({ err }, 'Send kudos error');
    throw err;
  }
}

async function getKudos(req, res) {
  try {
    const kudos = await prisma.kudos.findMany({
      where: { receiver_id: req.user.id },
      include: { sender: { select: { id: true, name: true, avatar_url: true } } },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
    return success(res, { kudos });
  } catch (err) {
    logger.error({ err }, 'Get kudos error');
    throw err;
  }
}

// ─── CLUBS ────────────────────────────────────────────────────────────────────
async function createClub(req, res) {
  try {
    const { name, description, location, interest_type, is_public = true } = req.body;
    const userId = req.user.id;

    const club = await prisma.club.create({
      data: { name, description, location, interest_type, is_public, created_by: userId, member_count: 1 },
    });

    // Creator auto-joins as admin
    await prisma.clubMember.create({
      data: { club_id: club.id, user_id: userId, role: 'ADMIN' },
    });

    return created(res, { club }, 'Club created! 🎉');
  } catch (err) {
    logger.error({ err }, 'Create club error');
    throw err;
  }
}

async function listClubs(req, res) {
  try {
    const { interest_type, city, page = 1, limit = 20 } = req.query;
    const where = { is_public: true };
    if (interest_type) where.interest_type = interest_type;
    if (city) where.location = { contains: city, mode: 'insensitive' };

    const clubs = await prisma.club.findMany({
      where,
      include: {
        _count: { select: { members: true } },
        members: { where: { user_id: req.user.id }, take: 1 },
      },
      orderBy: { member_count: 'desc' },
      skip:  (page - 1) * limit,
      take:  parseInt(limit),
    });

    return success(res, {
      clubs: clubs.map(c => ({
        ...c,
        member_count: c._count.members,
        joined: c.members.length > 0,
      })),
    });
  } catch (err) {
    logger.error({ err }, 'List clubs error');
    throw err;
  }
}

async function joinClub(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const club = await prisma.club.findUnique({ where: { id } });
    if (!club) return notFound(res, 'Club not found');

    const existing = await prisma.clubMember.findFirst({ where: { club_id: id, user_id: userId } });
    if (existing) return error(res, 'Already a member');

    await prisma.$transaction([
      prisma.clubMember.create({ data: { club_id: id, user_id: userId, role: 'MEMBER' } }),
      prisma.club.update({ where: { id }, data: { member_count: { increment: 1 } } }),
    ]);

    return created(res, {}, `Joined ${club.name}! 🏃`);
  } catch (err) {
    logger.error({ err }, 'Join club error');
    throw err;
  }
}

async function getClub(req, res) {
  try {
    const { id } = req.params;
    const club = await prisma.club.findUnique({
      where: { id },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, avatar_url: true } } },
          take: 20,
          orderBy: { joined_at: 'asc' },
        },
        challenges: { where: { ends_at: { gte: new Date() } }, take: 5 },
      },
    });
    if (!club) return notFound(res, 'Club not found');
    return success(res, { club });
  } catch (err) {
    logger.error({ err }, 'Get club error');
    throw err;
  }
}

async function getMyClubs(req, res) {
  try {
    const memberships = await prisma.clubMember.findMany({
      where: { user_id: req.user.id },
      include: { club: true },
      orderBy: { joined_at: 'desc' },
    });
    return success(res, { clubs: memberships.map(m => ({ ...m.club, role: m.role })) });
  } catch (err) {
    logger.error({ err }, 'Get my clubs error');
    throw err;
  }
}

// ─── POINTS ───────────────────────────────────────────────────────────────────
async function getMyPoints(req, res) {
  try {
    const points = await prisma.userPoints.upsert({
      where: { user_id: req.user.id },
      create: { user_id: req.user.id },
      update: {},
    });
    return success(res, { points });
  } catch (err) {
    logger.error({ err }, 'Get points error');
    throw err;
  }
}

// ─── ACTIVITY FEED ────────────────────────────────────────────────────────────
async function getActivityFeed(req, res) {
  try {
    const userId = req.user.id;

    // Get friend IDs
    const friendships = await prisma.friend.findMany({
      where: { OR: [{ requester_id: userId }, { receiver_id: userId }], is_accepted: true },
    });
    const friendIds = friendships.map(f => f.requester_id === userId ? f.receiver_id : f.requester_id);
    const allIds = [userId, ...friendIds];

    // Fetch recent workouts from self + friends
    const [recentWorkouts, recentAchievements, recentKudos] = await Promise.all([
      prisma.workout.findMany({
        where: { user_id: { in: allIds }, date: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
        include: { user: { select: { id: true, name: true, avatar_url: true } } },
        orderBy: { created_at: 'desc' },
        take: 20,
      }),
      prisma.userAchievement.findMany({
        where: { user_id: { in: allIds }, earned_at: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
        include: { user: { select: { id: true, name: true } }, achievement: true },
        orderBy: { earned_at: 'desc' },
        take: 10,
      }),
      prisma.kudos.findMany({
        where: { receiver_id: { in: allIds }, created_at: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
        include: {
          sender:   { select: { id: true, name: true } },
          receiver: { select: { id: true, name: true } },
        },
        orderBy: { created_at: 'desc' },
        take: 10,
      }),
    ]);

    // Merge and sort feed
    const feed = [
      ...recentWorkouts.map(w => ({ type: 'WORKOUT', timestamp: w.created_at, data: w })),
      ...recentAchievements.map(a => ({ type: 'ACHIEVEMENT', timestamp: a.earned_at, data: a })),
      ...recentKudos.map(k => ({ type: 'KUDOS', timestamp: k.created_at, data: k })),
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 30);

    return success(res, { feed, friend_count: friendIds.length });
  } catch (err) {
    logger.error({ err }, 'Get activity feed error');
    throw err;
  }
}

// ─── HELPER ───────────────────────────────────────────────────────────────────
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

module.exports = {
  checkAndAwardAchievements,
  getUserAchievements, triggerAchievementCheck,
  getLeaderboard,
  listChallenges, joinChallenge, getMyChallenges, createChallenge,
  sendFriendRequest, acceptFriendRequest, getFriends, searchUsers,
  sendKudos, getKudos,
  createClub, listClubs, joinClub, getClub, getMyClubs,
  getMyPoints, getActivityFeed,
};
