// src/routes/gamification.routes.js
'use strict';

const router = require('express').Router();
const { body, query } = require('express-validator');
const ctrl = require('../controllers/gamification.controller');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');

router.use(authenticate);

// ── Achievements ──────────────────────────────────────────────────────────────
router.get('/achievements',         ctrl.getUserAchievements);
router.post('/achievements/check',  ctrl.triggerAchievementCheck);

// ── Points ────────────────────────────────────────────────────────────────────
router.get('/points', ctrl.getMyPoints);

// ── Leaderboards ──────────────────────────────────────────────────────────────
router.get('/leaderboards',
  [
    query('type').optional().isIn(['MOST_ACTIVE', 'POINTS', 'MACRO_ADHERENCE', 'LOCAL_LEGEND', 'TRANSFORMATION']),
    query('period').optional().isIn(['WEEKLY', 'MONTHLY', 'ALL_TIME']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 50 }),
  ],
  validate,
  ctrl.getLeaderboard
);

// ── Challenges ────────────────────────────────────────────────────────────────
router.get('/challenges',       ctrl.listChallenges);
router.get('/challenges/mine',  ctrl.getMyChallenges);
router.post('/challenges',
  [
    body('name').notEmpty().withMessage('Challenge name required'),
    body('target_type').isIn(['DISTANCE_KM', 'WORKOUT_COUNT', 'CALORIE_BURN']).withMessage('Invalid target_type'),
    body('target_value').isFloat({ min: 1 }).withMessage('target_value must be positive'),
    body('starts_at').isISO8601().withMessage('starts_at required'),
    body('ends_at').isISO8601().withMessage('ends_at required'),
  ],
  validate,
  ctrl.createChallenge
);
router.post('/challenges/:id/join', ctrl.joinChallenge);

// ── Friends / Social ──────────────────────────────────────────────────────────
router.get('/friends',        ctrl.getFriends);
router.get('/users/search',
  [query('q').notEmpty().withMessage('Search query required')],
  validate,
  ctrl.searchUsers
);
router.post('/friends/request',
  [body('receiver_id').notEmpty().withMessage('receiver_id required')],
  validate,
  ctrl.sendFriendRequest
);
router.post('/friends/:id/accept', ctrl.acceptFriendRequest);

// ── Kudos ─────────────────────────────────────────────────────────────────────
router.get('/kudos', ctrl.getKudos);
router.post('/kudos',
  [
    body('receiver_id').notEmpty().withMessage('receiver_id required'),
    body('message').optional().trim().isLength({ max: 200 }),
  ],
  validate,
  ctrl.sendKudos
);

// ── Clubs ─────────────────────────────────────────────────────────────────────
router.get('/clubs',       ctrl.listClubs);
router.get('/clubs/mine',  ctrl.getMyClubs);
router.get('/clubs/:id',   ctrl.getClub);
router.post('/clubs',
  [
    body('name').notEmpty().withMessage('Club name required'),
    body('interest_type').isIn(['RUNNING', 'STRENGTH', 'YOGA', 'AEROBICS', 'TREKKING', 'WEIGHT_LOSS', 'GENERAL_FITNESS']),
  ],
  validate,
  ctrl.createClub
);
router.post('/clubs/:id/join', ctrl.joinClub);

// ── Activity Feed ─────────────────────────────────────────────────────────────
router.get('/feed', ctrl.getActivityFeed);

module.exports = router;
