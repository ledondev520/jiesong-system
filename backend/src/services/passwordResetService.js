/**
 * Input: bound email, single-use code, new password; Output: atomic reset and session revocation.
 * Restricted: never log recipient, code, password, hashes or provider responses.
 * Requires the additive email_password_recovery migration and private DirectMail configuration.
 */
const { randomInt, randomUUID, createHmac, timingSafeEqual } = require('node:crypto');
const bcrypt = require('bcrypt');
const { ipKeyGenerator } = require('express-rate-limit');
const prisma = require('../utils/prisma');
const config = require('../config');
const mail = require('./emailService');
const { createError } = require('../middleware/errorHandler');
const { assertPassword } = require('../utils/passwordPolicy');
const INVALID_CODE = '验证码无效或已过期，请重新获取或联系管理员';
const SEND_MESSAGE = '如果该邮箱绑定了可用账号，将收到验证码；未收到请稍后重试或联系管理员';
const digest = (purpose, value) => createHmac('sha256', config.jwt.secret)
  .update(`password-reset:${purpose}:${value}`).digest('hex');
const normalizeEmail = (email) => {
  if (typeof email !== 'string') throw createError('请输入有效邮箱地址', 400);
  return email.trim().toLowerCase();
};

// A bound email must identify exactly one account, including inactive accounts.
// Never infer a recovery address from username or phone, or choose the first duplicate.
async function eligibleAccount(tx, email) {
  const users = await tx.$queryRaw`SELECT id, email, isActive, sessionVersion FROM users WHERE lower(trim(email)) = ${email} LIMIT 2`;
  return users.length === 1 && users[0].isActive ? users[0] : null;
}

async function lockedTransaction(callback) {
  try {
    return await prisma.$transaction(async (tx) => {
      // SQLite: acquire the writer lock BEFORE reading quotas/attempts. This also
      // serializes independent workers; a process-local mutex would be insufficient.
      const locked = await tx.$executeRaw`UPDATE password_reset_lock SET id = id WHERE id = 1`;
      if (locked !== 1) throw new Error('missing reset lock');
      return callback(tx);
    }, { maxWait: 10000, timeout: 10000 });
  } catch (error) {
    if (error.statusCode) throw error;
    // Prisma error messages can contain query parameters. Keep them out of HTTP logs.
    throw createError('密码找回服务暂不可用，请稍后重试', 503);
  }
}

async function deliverCode(challenge, code) {
  try {
    await mail.sendPasswordResetCode(challenge.email, code, challenge.id);
    // An uncertain/failed send stays unusable; a delayed receipt cannot revive an old code.
    await prisma.passwordResetChallenge.updateMany({
      where: { id: challenge.id, codeHash: challenge.codeHash, expiresAt: { gt: new Date() } },
      data: { ready: true },
    });
  } catch {
    console.error('[PASSWORD_RESET] delivery not confirmed');
  }
}

async function sendCode(rawEmail, requesterIp) {
  const email = normalizeEmail(rawEmail);
  if (!mail.isConfigured()) throw createError('密码找回服务暂不可用，请联系管理员', 503);
  const id = randomUUID();
  const code = String(randomInt(0, 1000000)).padStart(6, '0');
  const codeHash = digest('code', `${id}:${code}`);
  // Same canonical key as HTTP: IPv4-mapped IPv6 is IPv4; IPv6 privacy addresses share /56.
  const requesterHash = digest('ip', ipKeyGenerator(requesterIp || 'unknown'));
  const challenge = await lockedTransaction(async (tx) => {
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 3600000);
    const recent = await tx.passwordResetChallenge.findFirst({ where: { email }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    if (recent && now - recent.createdAt < 60000) throw createError('请等待 60 秒后再获取验证码', 429);
    const perEmail = await tx.passwordResetChallenge.count({ where: { email, createdAt: { gte: hourAgo } } });
    const perIp = await tx.passwordResetChallenge.count({ where: { requesterHash, createdAt: { gte: hourAgo } } });
    const total = await tx.passwordResetChallenge.count({ where: { createdAt: { gte: hourAgo } } });
    if (perEmail >= 5 || perIp >= 10 || total >= 60) throw createError('验证码请求过于频繁，请一小时后重试', 429);
    await tx.passwordResetChallenge.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 86400000) } } });
    await tx.passwordResetChallenge.updateMany({ where: { email }, data: { ready: false, codeHash: '' } });
    const user = await eligibleAccount(tx, email);
    // Unknown/disabled/ambiguous addresses reserve identical persistent quotas.
    return tx.passwordResetChallenge.create({ data: {
      id, email, requesterHash, codeHash, userId: user?.id || null,
      sessionVersion: user?.sessionVersion ?? 0, createdAt: now,
      expiresAt: new Date(now.getTime() + 600000),
    } });
  });
  // Respond without waiting on provider timing, which would reveal account existence.
  // No retry: a crash or unconfirmed delivery requires a new request after cooldown.
  if (challenge.userId) setImmediate(() => { void deliverCode(challenge, code); });
  return { retryAfter: 60 };
}

async function resetPassword({ email: rawEmail, code, newPassword }) {
  const email = normalizeEmail(rawEmail);
  assertPassword(newPassword);
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw createError(INVALID_CODE, 400);
  const password = await bcrypt.hash(newPassword, 12);
  const reset = await lockedTransaction(async (tx) => {
    const now = new Date();
    const challenge = await tx.passwordResetChallenge.findFirst({ where: { email }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    if (!challenge || !challenge.ready || challenge.expiresAt <= now || challenge.attempts >= 5) return false;
    // Returning failures commits attempts. Throwing would roll back the brute-force counter.
    const attempt = await tx.passwordResetChallenge.updateMany({
      where: { id: challenge.id, ready: true, codeHash: challenge.codeHash, attempts: { lt: 5 }, expiresAt: { gt: now } },
      data: { attempts: { increment: 1 } },
    });
    if (attempt.count !== 1) return false;
    const expected = Buffer.from(challenge.codeHash, 'hex');
    const supplied = Buffer.from(digest('code', `${challenge.id}:${code}`), 'hex');
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return false;
    const user = await eligibleAccount(tx, email);
    if (!user || user.id !== challenge.userId || user.sessionVersion !== challenge.sessionVersion) return false;
    const consumed = await tx.passwordResetChallenge.updateMany({
      where: { id: challenge.id, ready: true, codeHash: challenge.codeHash },
      data: { ready: false, codeHash: '' },
    });
    if (consumed.count !== 1) return false;
    const updated = await tx.user.updateMany({
      where: { id: user.id, email: user.email, isActive: true, sessionVersion: challenge.sessionVersion },
      data: { password, sessionVersion: { increment: 1 } },
    });
    if (updated.count !== 1) throw createError(INVALID_CODE, 400);
    await tx.passwordResetChallenge.updateMany({ where: { userId: user.id }, data: { ready: false, codeHash: '' } });
    // Audit metadata only, committed with the password and challenge consumption.
    await tx.operationLog.create({ data: { userId: user.id, action: 'RESET_PASSWORD', entity: 'User', entityId: user.id } });
    return true;
  });
  if (!reset) throw createError(INVALID_CODE, 400);
  return null;
}
module.exports = { sendCode, resetPassword, SEND_MESSAGE };
