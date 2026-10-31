/**
 * Input: explicit bootstrap password and current admin record
 * Output: initialized/verified admin or a startup-blocking error
 * Pos: seed/startup gate; never resets an already-secure admin password
 */
const bcrypt = require('bcrypt');
const { assertPassword } = require('../utils/passwordPolicy');

async function ensureBootstrapAdmin(db, { password = process.env.DEFAULT_ADMIN_PASSWORD, allowCreate = false } = {}) {
  const admin = await db.user.findUnique({ where: { username: 'admin' } });
  if (!admin && !allowCreate) throw new Error('请先设置 DEFAULT_ADMIN_PASSWORD 并运行 npm run db:seed 初始化管理员');
  const legacy = admin && await bcrypt.compare('123456', admin.password);
  if (admin && !legacy) return admin;
  if (!password) throw new Error('必须设置符合密码策略的 DEFAULT_ADMIN_PASSWORD，禁止使用旧默认管理员密码');
  assertPassword(password);
  const hash = await bcrypt.hash(password, 12);
  if (!admin) return db.user.create({ data: { username: 'admin', password: hash, name: '管理员', role: 'ADMIN' } });
  const updated = await db.user.updateMany({ where: { id: admin.id, password: admin.password }, data: {
    password: hash, sessionVersion: { increment: 1 },
  } });
  if (updated.count !== 1) throw new Error('管理员已被并发修改，请重新启动后检查');
  return db.user.findUnique({ where: { id: admin.id } });
}
module.exports = { ensureBootstrapAdmin };
