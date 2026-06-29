'use strict';
/**
 * Password reset helpers.
 * Token returned is plaintext (sent to user). Only its sha256 is stored.
 */
const crypto = require('crypto');
const prisma = require('./prisma');
const env = require('./env');

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

async function issueReset(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + env.reset.ttlMin * 60 * 1000);
  await prisma.passwordReset.create({
    data: { userId, tokenHash: sha256(token), expiresAt },
  });
  return { token, tokenHash: sha256(token), expiresAt };
}

async function consumeReset(token) {
  const rec = await prisma.passwordReset.findUnique({
    where: { tokenHash: sha256(token) },
  });
  if (!rec || rec.usedAt || rec.expiresAt < new Date()) return null;
  await prisma.passwordReset.update({
    where: { id: rec.id },
    data: { usedAt: new Date() },
  });
  return { userId: rec.userId };
}

module.exports = { issueReset, consumeReset };
