// src/config/db.js — lazy Prisma init, never crash without DATABASE_URL
'use strict';

const { PrismaClient } = require('@prisma/client');
const config = require('./index');

if (!config.db.url) {
  // Export a proxy that throws a clear error on any DB call
  const errMsg = 'DATABASE_URL is not set. On Railway: Variables → Reference DATABASE from Postgres plugin.';
  module.exports = new Proxy({}, {
    get: (_, prop) => {
      if (prop === '$disconnect') return async () => {};
      if (prop === '$queryRaw')   return async () => { throw new Error(errMsg); };
      return () => Promise.reject(new Error(errMsg));
    }
  });
} else {
  const prisma = new PrismaClient({
    log: config.app.isDev ? ['warn', 'error'] : ['error'],
    errorFormat: 'minimal',
  });
  process.on('beforeExit', async () => { await prisma.$disconnect(); });
  module.exports = prisma;
}
