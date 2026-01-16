/**
 * Input: Prisma客户端、bcryptjs
 * Output: 初始化数据库种子数据
 * Pos: 数据库初始化脚本
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('开始初始化数据库...');
  
  // 1. 创建管理员用户
  const adminPassword = await bcrypt.hash('123456', 12);
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: { password: adminPassword },
    create: {
      username: 'admin',
      password: adminPassword,
      name: '管理员',
      role: 'ADMIN',
    },
  });
  console.log('✓ 管理员用户创建成功 (admin / 123456)');
  
  // 2. 创建港口数据
  const ports = [
    { name: '洛杉矶', code: 'LA' },
    { name: 'Oakland', code: 'OAK' },
    { name: '密歇根', code: 'MI' },
  ];
  
  for (const port of ports) {
    await prisma.port.upsert({
      where: { code: port.code },
      update: {},
      create: port,
    });
  }
  console.log('✓ 港口数据创建成功');
  
  // 3. 创建系统配置
  const configs = [
    { 
      key: 'exchangeRate', 
      value: JSON.stringify({ rate: 6.8, buffer: 0.2, auto: true }), 
      note: '汇率配置' 
    },
    { 
      key: 'profitRate', 
      value: JSON.stringify({ rate: 1.3 }), 
      note: '利润率配置' 
    },
    { 
      key: 'contractPrefix', 
      value: JSON.stringify({ purchase: 'CG', sales: 'EXP' }), 
      note: '合同编号前缀' 
    },
    { 
      key: 'containerPrefix', 
      value: JSON.stringify({ format: 'YY-NNN-PORT' }), 
      note: '货柜编号规则' 
    },
  ];
  
  for (const config of configs) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: { value: config.value, note: config.note },
      create: config,
    });
  }
  console.log('✓ 系统配置创建成功');
  
  console.log('\n数据库初始化完成！');
}

main()
  .catch((e) => {
    console.error('初始化失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
