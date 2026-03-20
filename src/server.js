// src/server.js
'use strict';

const app    = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const prisma = require('./config/db');

const PORT = config.app.port;

const server = app.listen(PORT, '0.0.0.0', async () => {
  logger.info(`🚀 ${config.app.name} running on port ${PORT} [${config.app.env}]`);
  logger.info(`   Health: http://localhost:${PORT}/api/health`);
  logger.info(`   Phase : Phase 0 + 1A — Foundation + MVP Fitness App`);

  // Warm up DB connection
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.info('✅ PostgreSQL connected');
  } catch (err) {
    logger.error({ err }, '❌ PostgreSQL connection failed');
  }
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(async () => {
    await prisma.$disconnect();
    logger.info('Server closed');
    process.exit(0);
  });
  // Force kill after 10s
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
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
