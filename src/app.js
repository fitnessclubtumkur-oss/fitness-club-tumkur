// src/app.js
'use strict';

const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const compression = require('compression');
const morgan  = require('morgan');
const config  = require('./config');
const logger  = require('./utils/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { generalLimiter } = require('./middleware/rateLimit');

// ─── Routes ───────────────────────────────────────────────────────────────────
const authRoutes         = require('./routes/auth.routes');
const profileRoutes      = require('./routes/profile.routes');
const workoutRoutes      = require('./routes/workout.routes');
const mealRoutes         = require('./routes/meal.routes');
const dashboardRoutes    = require("./routes/dashboard.routes");
const nutritionRoutes    = require("./routes/nutrition.routes");
const syncRoutes         = require("./routes/sync.routes");
const kitchenRoutes      = require('./routes/kitchen.routes');
const gamificationRoutes = require('./routes/gamification.routes');
const aiRoutes            = require('./routes/ai.routes');
const preferencesRoutes   = require('./routes/preferences.routes');
const { healthCheck }    = require('./controllers/dashboard.controller');

const app = express();

// ─── Security ─────────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, cb) => {
    const allowed = [
      config.app.frontendUrl,
      'http://localhost:5173',
      'http://localhost:3000',
      /\.netlify\.app$/,
      /\.railway\.app$/,
    ];
    if (!origin) return cb(null, true);
    const ok = allowed.some(p => p instanceof RegExp ? p.test(origin) : p === origin);
    cb(ok ? null : new Error('Not allowed by CORS'), ok);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-seed-secret'],
}));

// ─── Compression + parsing ────────────────────────────────────────────────────
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Logging ──────────────────────────────────────────────────────────────────
if (config.app.isDev) {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', {
    stream: { write: (msg) => logger.info(msg.trim()) },
    skip: (req) => req.path === '/api/health',
  }));
}

// ─── Trust Railway proxy ──────────────────────────────────────────────────────
app.set('trust proxy', 1);

// ─── General rate limit ───────────────────────────────────────────────────────
app.use('/api/', generalLimiter);

// ─── Health check (no auth) ───────────────────────────────────────────────────
app.get('/api/health', healthCheck);

// ─── One-time seed endpoint (no auth middleware — protected by SEED_SECRET) ───
app.post('/api/admin/seed', async (req, res) => {
  const secret = req.headers['x-seed-secret'];
  if (!secret || secret !== process.env.SEED_SECRET) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  try {
    const { execSync } = require('child_process');
    const out = execSync('node prisma/seed.js', {
      timeout: 120_000,
      cwd: require('path').join(__dirname, '..'),
    }).toString();
    return res.json({ success: true, message: 'Seed completed', output: out.slice(-500) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/profile',   profileRoutes);
app.use('/api/workouts',  workoutRoutes);
app.use('/api/meals',     mealRoutes);
app.use('/api',           dashboardRoutes);
app.use('/api/nutrition', nutritionRoutes);
app.use('/api',           syncRoutes);
app.use('/api',           kitchenRoutes);
app.use('/api',           gamificationRoutes);
app.use('/api',           aiRoutes);
app.use('/api',           preferencesRoutes);

// ─── Serve PWA frontend ───────────────────────────────────────────────────────
const path = require('path');
app.use(express.static(path.join(__dirname, '../assets'), { maxAge: '1d', etag: true }));

// ─── Root ─────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  const html = path.join(__dirname, '../assets/index.html');
  if (require('fs').existsSync(html)) return res.sendFile(html);
  res.json({
    name: config.app.name,
    version: '1.0.0',
    status: 'running',
    docs: `${config.app.url}/api/health`,
  });
});

// ─── 404 + Error handlers ─────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
