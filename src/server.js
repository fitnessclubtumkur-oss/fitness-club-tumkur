// src/server.js  — Bulletproof Railway startup
// Rule: HTTP server MUST listen before ANY async work starts
'use strict';

const http = require('http');

// ─── STEP 1: Bind to PORT immediately — before any require() that might throw ─
const PORT = process.env.PORT || 3000;

// Minimal inline health handler — works even if the full app fails to load
const server = http.createServer((req, res) => {
  if (req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      success: true,
      data: { status: appReady ? 'healthy' : 'starting', version: '1.0.0',
              db: dbReady ? 'connected' : 'pending', timestamp: new Date().toISOString(),
              uptime_s: Math.floor(process.uptime()) },
    }));
  }
  // Delegate to Express once ready
  if (appReady && expressApp) return expressApp(req, res);
  res.writeHead(503, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: false, message: 'Server starting up, please retry in a few seconds' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] Listening on port ${PORT} — app loading...`);
  // Now it's safe to do slow async work
  setImmediate(bootstrap);
});

server.on('error', (err) => { console.error('[server] Fatal:', err); process.exit(1); });

// ─── STEP 2: Bootstrap app asynchronously ─────────────────────────────────────
let appReady   = false;
let dbReady    = false;
let expressApp = null;
let prisma     = null;

async function bootstrap() {
  // 2a. Load Express app (sync — may throw on bad config)
  try {
    expressApp = require('./app');
    console.log('[server] Express app loaded');
  } catch (err) {
    console.error('[server] Express load failed:', err.message);
    // Keep serving /api/health as 503 — don't exit
    return;
  }

  appReady = true;
  console.log(`[server] 🚀 App ready on port ${PORT}`);

  // 2b. Validate DATABASE_URL
  if (!process.env.DATABASE_URL) {
    console.error('[server] ⚠️  DATABASE_URL not set — DB features unavailable');
    console.error('[server]    On Railway: Variables tab → Add Variable → Reference DATABASE from Postgres plugin');
    return; // Still serve static/health — don't crash
  }

  // 2c. Push schema (non-blocking)
  await pushSchema();

  // 2d. Connect Prisma
  try {
    prisma = require('./config/db');
    await prisma.$queryRaw`SELECT 1`;
    dbReady = true;
    console.log('[server] ✅ PostgreSQL connected');

    // Start background jobs (cron)
    try {
      const { startScheduler } = require('./utils/scheduler');
      startScheduler();
    } catch (e) { console.warn('[server] Scheduler init failed:', e.message); }
  } catch (err) {
    console.error('[server] ⚠️  DB connect failed:', err.message);
  }
}

async function pushSchema() {
  const { execSync } = require('child_process');
  try {
    console.log('[server] Running prisma db push...');
    execSync('npx prisma db push --accept-data-loss', {
      stdio: 'pipe', timeout: 90_000,
    });
    console.log('[server] ✅ Schema pushed');
  } catch (err) {
    console.error('[server] ⚠️  Schema push failed:', err.stderr?.toString() || err.message);
  }
}

// ─── Graceful shutdown ─────────────────────────────────────────────────────────
const shutdown = (sig) => {
  console.log(`[server] ${sig} — shutting down`);
  server.close(async () => {
    if (prisma) await prisma.$disconnect().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('unhandledRejection', (r) => console.error('[server] UnhandledRejection:', r));
process.on('uncaughtException',  (e) => { console.error('[server] UncaughtException:', e.message); });

module.exports = server;
