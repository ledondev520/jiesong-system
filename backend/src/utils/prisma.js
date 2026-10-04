/**
 * Input: Prisma Client库
 * Output: 单例Prisma客户端实例（禁止输出带密码/验证码参数的查询和异常）
 * Pos: 数据库连接工具，提供统一的Prisma实例
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { PrismaClient } = require('@prisma/client');

// 创建单例实例，避免开发时热重载导致多个连接
const globalForPrisma = global;

const prisma = globalForPrisma.prisma || new PrismaClient({
  // Prisma query/error output can include auth write arguments. Services expose
  // sanitized failures; never let ORM diagnostics print credentials or code hashes.
  log: [],
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;
