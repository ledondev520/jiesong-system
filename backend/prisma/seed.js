/**
 * Input: Prisma客户端、显式初始化密码
 * Output: 初始化数据库种子数据，不重置既有安全密码
 * Pos: 数据库初始化脚本
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { PrismaClient } = require('@prisma/client');
const { ensureBootstrapAdmin } = require('../src/services/bootstrapAdmin');

const prisma = new PrismaClient();

async function main() {
  console.log('开始初始化数据库...');
  
  // 1. 创建管理员用户
  await ensureBootstrapAdmin(prisma, { allowCreate: true });
  console.log('✓ 管理员已初始化或验证，未覆盖既有安全密码');

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
    console.error('初始化失败，请检查管理员初始化配置或数据库结构');
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
