'use strict';
/**
 * Single Prisma client instance. Reusing across hot reloads prevents
 * "Too many connections" warnings on dev.
 */
const { PrismaClient } = require('@prisma/client');

const globalForPrisma = globalThis;
const prisma =
  globalForPrisma.__prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
  });

if (!globalForPrisma.__prisma) {
  globalForPrisma.__prisma = prisma;
}

module.exports = prisma;
