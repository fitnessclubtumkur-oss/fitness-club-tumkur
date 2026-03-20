// src/config/db.js
'use strict';

const { PrismaClient } = require('@prisma/client');
const config = require('./index');

const prisma = new PrismaClient({
  log: config.app.isDev ? ['query', 'info', 'warn', 'error'] : ['error'],
  errorFormat: config.app.isDev ? 'pretty' : 'minimal',
});

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

module.exports = prisma;
