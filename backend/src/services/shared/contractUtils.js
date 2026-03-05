/**
 * Input: 合同服务共享参数
 * Output: 状态归一化、数字解析与合同号派生能力
 * Pos: container/sales 服务复用工具，降低重复实现
 */

const normalizeFilterStatus = (status) => {
  if (typeof status !== 'string') {
    return status;
  }

  const normalized = status.trim();
  if (!normalized) {
    return normalized;
  }

  return normalized.toUpperCase().replace(/[\s-]+/g, '_');
};

const parseNullableNumber = (value, fallback = null) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const generateNextContractNo = async ({ prisma, year, portCode }) => {
  if (portCode) {
    const count = await prisma.salesContract.count({
      where: {
        contractNo: {
          startsWith: `${year}-`,
          endsWith: `-${portCode}`,
        },
      },
    });

    return `${year}-${String(count + 1).padStart(3, '0')}-${portCode}`;
  }

  const count = await prisma.salesContract.count({
    where: { contractNo: { startsWith: `EXP${year}` } },
  });

  return `EXP${year}${String(count + 1).padStart(5, '0')}`;
};

module.exports = {
  normalizeFilterStatus,
  parseNullableNumber,
  generateNextContractNo,
};
