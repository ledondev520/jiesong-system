/**
 * 供应商联系人补全脚本
 * Input: suppliers 表中 contactName 为 NULL 的记录
 * Output: 有电话的填"负责人"，无电话的填"待补充"
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== 供应商联系人补全开始 ===');

  // 获取所有 contactName 为 NULL 的供应商
  const suppliers = await prisma.supplier.findMany({
    where: { contactName: null },
    select: {
      id: true,
      name: true,
      phone: true,
      contactPhone: true,
    },
  });
  console.log(`contactName 为 NULL 的供应商总数: ${suppliers.length}`);

  let updatedResponsible = 0;
  let updatedPending = 0;
  const skipped = [];

  for (const supplier of suppliers) {
    const hasPhone = !!(supplier.phone || supplier.contactPhone);

    if (hasPhone) {
      await prisma.supplier.update({
        where: { id: supplier.id },
        data: { contactName: '负责人' },
      });
      updatedResponsible++;
    } else {
      await prisma.supplier.update({
        where: { id: supplier.id },
        data: { contactName: '待补充' },
      });
      updatedPending++;
      skipped.push({ id: supplier.id, name: supplier.name });
    }
  }

  console.log(`\n=== 补全结果 ===`);
  console.log(`回填为"负责人": ${updatedResponsible}`);
  console.log(`标记为"待补充": ${updatedPending}`);
  console.log(`总计处理: ${updatedResponsible + updatedPending}/${suppliers.length}`);

  if (skipped.length > 0) {
    console.log(`\n--- 标记为"待补充"的供应商（无联系方式） ---`);
    for (const s of skipped) {
      console.log(`  [${s.id}] ${s.name}`);
    }
  }

  console.log('\n=== 供应商联系人补全完成 ===');
}

main()
  .catch((err) => {
    console.error('脚本执行失败:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
