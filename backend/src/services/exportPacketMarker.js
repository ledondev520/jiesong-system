/**
 * Input: 出口单证归档文件的 description 文本
 * Output: 新「四单」与历史「三单」归档标记的识别（权限前缀 + 明细版本哈希）
 * Pos: 独立小模块，避免 fileService 与 exportPacketService 循环依赖
 */

// 新归档标记为「四单」；历史归档仍是「三单」文案，权限与退税指纹两处都同时识别。
const EXPORT_PACKET_DESCRIPTION = '出口四单生成版本（外销合同、商业发票、装箱单、报关预录）';
const LEGACY_EXPORT_PACKET_DESCRIPTION = '出口三单生成版本（外销合同、商业发票、装箱单）';
const EXPORT_PACKET_PREFIXES = ['出口四单生成版本', '出口三单生成版本'];

const isExportPacketDescription = (description) => EXPORT_PACKET_PREFIXES.some((prefix) => String(description || '').startsWith(prefix));

/** 返回归档描述里的明细版本哈希（新旧文案均可）；不是出口单证描述时返回 null。 */
const exportPacketSourceVersion = (description) => {
  const text = String(description || '');
  const base = [EXPORT_PACKET_DESCRIPTION, LEGACY_EXPORT_PACKET_DESCRIPTION].find((value) => text.startsWith(`${value}:`));
  return base ? text.slice(base.length + 1) : null;
};

module.exports = {
  EXPORT_PACKET_DESCRIPTION,
  LEGACY_EXPORT_PACKET_DESCRIPTION,
  isExportPacketDescription,
  exportPacketSourceVersion,
};
