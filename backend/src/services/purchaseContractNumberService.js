/**
 * Input: Prisma 客户端/事务与两位年份
 * Output: 当前年份未占用的下一个 CG 采购合同编号
 * Pos: 采购创建、编号预览和批量导入共用的编号规则；预览不预留编号
 */
const generateNextPurchaseContractNo = async (db, year = new Date().getFullYear().toString().slice(-2)) => {
  const prefix = `CG${year}`;
  const contracts = await db.purchaseContract.findMany({
    where: { contractNo: { startsWith: prefix } },
    select: { contractNo: true },
  });
  let highest = 0n;
  for (const { contractNo } of contracts) {
    const suffix = contractNo.slice(prefix.length);
    // 自定义编号不参与自动序列；BigInt 避免五位溢出后的排序或精度截断。
    if (!/^\d{5,}$/.test(suffix)) continue;
    const sequence = BigInt(suffix);
    if (sequence > highest) highest = sequence;
  }
  return `${prefix}${String(highest + 1n).padStart(5, '0')}`;
};

const isPurchaseNumberConflict = (error) => error?.code === 'P2002'
  && (Array.isArray(error.meta?.target) ? error.meta.target : [error.meta?.target])
    .some((target) => typeof target === 'string' && target.includes('contractNo'));

module.exports = { generateNextPurchaseContractNo, isPurchaseNumberConflict };
