/**
 * Input: Password-verified JWT, opaque cookie and session-bound CSRF proof
 * Output: Fixed-expiry, individually revocable browser sessions; never a JS-readable credential
 * Pos: Browser-only auth transport; bearer/Agent credentials remain independent
 * Note: Production requires HTTPS and explicit CORS_ORIGIN; no sliding expiry or refresh.
 */
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');
const prisma = require('../utils/prisma');
const { createError } = require('../middleware/errorHandler');
const COOKIE_NAME = config.nodeEnv === 'production' ? '__Host-jiesong_session' : 'jiesong_session';
const cookieOptions = () => ({ httpOnly: true, secure: config.nodeEnv === 'production', sameSite: 'strict', path: '/' });
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const csrfToken = (token) => crypto.createHmac('sha256', config.jwt.secret).update(`browser-session:csrf:${token}`).digest('hex');

const readCookie = (req) => {
  const matches = String(req.headers.cookie || '').split(';').map((part) => part.trim()).filter((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (!matches.length) return null;
  const value = matches[0].slice(COOKIE_NAME.length + 1);
  if (matches.length !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
  return value;
};
const clearCookie = (res) => res.clearCookie(COOKIE_NAME, cookieOptions());
const requireOrigin = (req) => {
  const origin = req.headers.origin;
  let allowed = typeof origin === 'string' && config.cors.origin.includes(origin);
  // Local development only. Never trust Host/X-Forwarded-* to authorize production writes.
  if (!allowed && config.nodeEnv !== 'production' && config.cors.origin.length === 0) {
    try {
      const url = new URL(origin);
      allowed = url.origin === origin && ['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    } catch { /* Missing/null/malformed origins fail closed. */ }
  }
  if (!allowed || req.headers['sec-fetch-site'] === 'cross-site') throw createError('请求来源验证失败，请刷新页面后重试', 403);
};
const requireCsrf = (req, token) => {
  requireOrigin(req);
  const proof = req.headers['x-csrf-token'];
  if (typeof proof !== 'string' || !/^[a-f0-9]{64}$/.test(proof) || !crypto.timingSafeEqual(Buffer.from(proof), Buffer.from(csrfToken(token)))) {
    throw createError('请求验证失败，请刷新页面后重试', 403);
  }
};
const database = async (operation) => {
  try { return await operation(); }
  catch { throw createError('暂时无法验证登录状态，请稍后重试', 503); }
};
const revoke = async (token) => {
  if (token) await database(() => prisma.browserSession.deleteMany({ where: { tokenHash: hashToken(token) } }));
};
const create = async (req, res, verifiedJwt) => {
  const claims = jwt.verify(verifiedJwt, config.jwt.secret);
  if (!Number.isSafeInteger(claims.exp) || claims.exp * 1000 <= Date.now()) throw createError('登录已失效，请重新登录', 401);
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(claims.exp * 1000);
  const oldToken = readCookie(req);
  // Atomic replacement affects this browser only. Expired records are pruned on successful login.
  await database(() => prisma.$transaction(async (tx) => {
    await tx.browserSession.deleteMany({ where: { OR: [{ expiresAt: { lte: new Date() } }, ...(oldToken ? [{ tokenHash: hashToken(oldToken) }] : [])] } });
    await tx.browserSession.create({ data: { tokenHash: hashToken(token), userId: claims.userId, sessionVersion: claims.sessionVersion, expiresAt } });
  }));
  res.cookie(COOKIE_NAME, token, { ...cookieOptions(), expires: expiresAt });
  return { csrfToken: csrfToken(token), expiresAt: expiresAt.toISOString() };
};
const authenticate = async (req) => {
  const token = readCookie(req);
  if (!token) throw createError('未提供认证Token', 401);
  if (req.headers.origin || ['same-site', 'cross-site'].includes(req.headers['sec-fetch-site'])) requireOrigin(req);
  // Protect every cookie-authenticated mutation, including multipart and SSE POSTs.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) requireCsrf(req, token);
  const session = await database(() => prisma.browserSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: { select: { id: true, username: true, name: true, role: true, isActive: true, sessionVersion: true } } } }));
  if (!session || session.expiresAt.getTime() <= Date.now() || !session.user?.isActive || session.sessionVersion !== session.user.sessionVersion) {
    throw createError('登录已失效，请重新登录', 401);
  }
  req.browserSession = { csrfToken: csrfToken(token), expiresAt: session.expiresAt.toISOString() };
  const { sessionVersion: _version, ...user } = session.user;
  return user;
};
const protectLogin = (req, _res, next) => {
  try {
    // Existing cookies are replaced/cleared only by an intentional same-origin login.
    if (req.body?.rememberMe === true || String(req.headers.cookie || '').includes(`${COOKIE_NAME}=`)) requireOrigin(req);
    next();
  } catch (error) { next(error); }
};
const logoutProof = (req) => {
  // Allows revocation after disable/expiry without returning an authenticated user or cookie.
  if (req.headers['sec-fetch-site'] !== 'same-origin' || req.headers.origin) requireOrigin(req);
  const token = readCookie(req);
  return { csrfToken: token ? csrfToken(token) : null };
};
const logout = async (req) => {
  const token = readCookie(req);
  if (token) { requireCsrf(req, token); await revoke(token); }
  // No Set-Cookie on revocation: a late response must not erase a newer browser login.
};
module.exports = { COOKIE_NAME, cookieOptions, readCookie, clearCookie, requireOrigin, requireCsrf, create, authenticate, protectLogin, logoutProof, logout, revoke };
