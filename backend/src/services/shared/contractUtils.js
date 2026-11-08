/**
 * Input: 合同服务共享参数
 * Output: 状态归一化、数字解析与合同号派生能力
 * Pos: container/sales 服务复用工具，降低重复实现
 */

const { createError } = require('../../middleware/errorHandler');

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

// 提单号：运营标识，可空；去空白后最长 50 字符，空串视为清空。
const BL_NO_MAX_LENGTH = 50;
const normalizeBlNo = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw createError('提单号必须为文本', 400);
  const text = value.trim();
  if (text.length > BL_NO_MAX_LENGTH) throw createError(`提单号不能超过${BL_NO_MAX_LENGTH}个字符`, 400);
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(text)) throw createError('提单号不能包含控制字符', 400);
  return text || null;
};

module.exports = {
  normalizeBlNo,
  normalizeFilterStatus,
  parseNullableNumber,
  generateNextContractNo,
};
