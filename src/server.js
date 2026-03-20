// src/server.js
'use strict';

const app    = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const prisma = require('./config/db');

// Railway injects PORT - always use it
const PORT = process.env.PORT || config.app.port || 3000;

const server = app.listen(PORT, '0.0.0.0', async () => {
  logger.info(`🚀 ${config.app.name} running on port ${PORT} [${config.app.env}]`);
  logger.info(`   Health : http://localhost:${PORT}/api/health`);
  logger.info(`   Phase  : Phase 0 + 1A + 1B — Foundation + MVP + Nutrition`);

  // Verify DB connection — log result but never crash the server
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.info('✅ PostgreSQL connected');
  } catch (err) {
    // DB may still be warming up on Railway — healthcheck will pass
    // as long as HTTP server is listening; DB retries happen per-request
    logger.warn({ msg: err.message }, '⚠️  PostgreSQL not yet ready (will retry on first request)');
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`Port ${PORT} already in use`);
    process.exit(1);
  }
  throw err;
});

// ─── Graceful shutdown ─────────────────────────────────────────────────────
async function shutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(async () => {
    await prisma.$disconnect().catch(() => {});
    logger.info('Server closed cleanly');
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('Forced shutdown after 10s timeout');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled Promise Rejection');
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught Exception — shutting down');
  shutdown('uncaughtException');
});

module.exports = server;
