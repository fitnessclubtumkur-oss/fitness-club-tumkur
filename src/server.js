// src/server.js
'use strict';

const { execSync } = require('child_process');
const app    = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const prisma = require('./config/db');

const PORT = process.env.PORT || config.app.port || 3000;

// ─── Start HTTP server FIRST so healthcheck passes immediately ────────────────
// DB schema push happens in background AFTER server is already listening
const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info(`🚀 ${config.app.name} running on port ${PORT} [${config.app.env}]`);
  logger.info(`   Health: http://localhost:${PORT}/api/health`);

  // Run db push in background — non-blocking
  setImmediate(runDbSetup);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`Port ${PORT} already in use`); process.exit(1);
  }
  throw err;
});

async function runDbSetup() {
  // 1. Push schema to database (create/update all tables)
  logger.info('⏳ Running prisma db push...');
  try {
    execSync('npx prisma db push --accept-data-loss', {
      stdio: 'inherit',
      timeout: 60_000,
      env: { ...process.env },
    });
    logger.info('✅ Database schema up to date');
  } catch (err) {
    logger.error({ msg: err.message }, '❌ prisma db push failed — tables may be missing');
    // Don't exit — server continues, API returns 500s until DB is fixed
    return;
  }

  // 2. Verify DB connection
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.info('✅ PostgreSQL connected');
  } catch (err) {
    logger.warn({ msg: err.message }, '⚠️  PostgreSQL ping failed');
  }
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown(signal) {
  logger.info(`${signal} — shutting down`);
  server.close(async () => {
    await prisma.$disconnect().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled Rejection');
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught Exception');
  shutdown('uncaughtException');
});

module.exports = server;
