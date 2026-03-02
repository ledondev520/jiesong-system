/**
 * 输入：任意字段文本
 * 输出：去首尾空白且非空字符串，或 undefined
 * 说明：用于控制器参数清洗与可选文本字段统一处理。
 */

const parseOptionalText = (value) => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

module.exports = {
  parseOptionalText,
};
