/** Input: validated registration fields; Output: verified, inactive SALES account. */
const { randomInt, randomUUID, createHmac, timingSafeEqual } = require('node:crypto');
const bcrypt = require('bcrypt');
const prisma = require('../utils/prisma');
const config = require('../config');
const mail = require('./emailService');
const { createError } = require('../middleware/errorHandler');
const digest = (id, code) => createHmac('sha256', config.jwt.secret).update(`${id}:${code}`).digest('hex');
const existingAccount = async (tx, email) => (await tx.$queryRaw`SELECT id FROM users WHERE lower(username) = ${email} OR lower(email) = ${email} LIMIT 1`).length > 0;

async function sendCode(email) {
  if (!mail.isConfigured()) throw createError('邮箱注册服务暂不可用，请联系管理员', 503);
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 3600000);
  const id = randomUUID();
  const code = String(randomInt(0, 1000000)).padStart(6, '0');
  const codeHash = digest(id, code);
  // Reserve persistent quotas before sending; a failed or uncertain send still counts.
  await prisma.$transaction(async (tx) => {
    if (await existingAccount(tx, email)) throw createError('该邮箱已有账号，请登录或联系管理员', 409);
    const recent = await tx.emailRegistrationChallenge.findFirst({ where: { email }, orderBy: { createdAt: 'desc' } });
    if (recent && now - recent.createdAt < 60000) throw createError('请等待 60 秒后再获取验证码', 429);
    const perEmail = await tx.emailRegistrationChallenge.count({ where: { email, createdAt: { gte: hourAgo } } });
    const total = await tx.emailRegistrationChallenge.count({ where: { createdAt: { gte: hourAgo } } });
    if (perEmail >= 5 || total >= 60) throw createError('验证码请求过于频繁，请一小时后重试', 429);
    await tx.emailRegistrationChallenge.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 86400000) } } });
    await tx.emailRegistrationChallenge.updateMany({ where: { email }, data: { ready: false, codeHash: '' } });
    await tx.emailRegistrationChallenge.create({ data: { id, email, codeHash, createdAt: now, expiresAt: new Date(now.getTime() + 600000) } });
  });
  await mail.sendRegistrationCode(email, code, id);
  const activated = await prisma.emailRegistrationChallenge.updateMany({ where: { id, codeHash }, data: { ready: true } });
  if (!activated.count) throw createError('验证码已更新，请使用最近一次邮件', 400);
  return { retryAfter: 60 };
}

async function register({ email, code, password, name }) {
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.$transaction(async (tx) => {
    const challenge = await tx.emailRegistrationChallenge.findFirst({ where: { email }, orderBy: { createdAt: 'desc' } });
    if (!challenge || !challenge.ready || challenge.expiresAt <= new Date() || challenge.attempts >= 5) return null;
    // Commit failed attempts too; throwing inside this transaction would roll them back.
    await tx.emailRegistrationChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    const expected = Buffer.from(challenge.codeHash, 'hex');
    const supplied = Buffer.from(digest(challenge.id, code), 'hex');
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
    if (await existingAccount(tx, email)) throw createError('该邮箱已有账号，请登录或联系管理员', 409);
    await tx.emailRegistrationChallenge.update({ where: { id: challenge.id }, data: { ready: false, codeHash: '' } });
    return tx.user.create({
      data: { username: email, email, name, password: passwordHash, role: 'SALES', isActive: false },
      select: { id: true, email: true, name: true, isActive: true },
    });
  });
  if (!user) throw createError('验证码无效或已过期，请重新获取', 400);
  return user;
}
module.exports = { sendCode, register };
