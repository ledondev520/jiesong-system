/**
 * Input: 采购合同数据、供应商数据
 * Output: Word文档（购销合同）
 * Pos: 服务层，根据模板生成购销合同文档
 * 
 * 2026-01-20 更新：使用 {{placeholder}} 占位符模板
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const fs = require('fs').promises;
const path = require('path');
const AdmZip = require('adm-zip');

// 模板路径
const TEMPLATE_PATH = path.join(__dirname, '../../templates/购销合同模板.docx');

/**
 * 职责：将数字金额转换为大写中文
 * @param {number} n - 数字金额
 * @returns {string} 大写金额
 */
const numberToChinese = (n) => {
  if (n === 0) return '零元整';
  
  const digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
  const units = ['', '拾', '佰', '仟'];
  const bigUnits = ['', '万', '亿'];
  
  const intPart = Math.floor(n);
  const decPart = Math.round((n - intPart) * 100);
  
  let result = '';
  
  // 整数部分
  if (intPart > 0) {
    const str = intPart.toString();
    const len = str.length;
    let zeroFlag = false;
    
    for (let i = 0; i < len; i++) {
      const digit = parseInt(str[i]);
      const unitPos = (len - 1 - i) % 4;
      const bigUnitPos = Math.floor((len - 1 - i) / 4);
      
      if (digit === 0) {
        zeroFlag = true;
      } else {
        if (zeroFlag) {
          result += '零';
          zeroFlag = false;
        }
        result += digits[digit] + units[unitPos];
      }
      
      if (unitPos === 0 && bigUnitPos > 0) {
        result += bigUnits[bigUnitPos];
      }
    }
    result += '元';
  }
  
  // 小数部分
  if (decPart > 0) {
    const jiao = Math.floor(decPart / 10);
    const fen = decPart % 10;
    if (jiao > 0) result += digits[jiao] + '角';
    if (fen > 0) result += digits[fen] + '分';
  } else {
    result += '整';
  }
  
  return result;
};

/**
 * 职责：生成购销合同编号
 * @param {string} purchaseContractNo - 采购合同号
 * @returns {string} 购销合同号（CG格式）
 */
const generateContractNo = (purchaseContractNo) => {
  if (!purchaseContractNo) return 'CG000000';
  // PO开头 -> CG开头
  if (purchaseContractNo.startsWith('PO')) {
    return purchaseContractNo.replace(/^PO/, 'CG');
  }
  // 已经是CG开头 -> 保持不变
  if (purchaseContractNo.startsWith('CG')) {
    return purchaseContractNo;
  }
  // 其他情况 -> 添加CG前缀
  return 'CG' + purchaseContractNo;
};

/**
 * 职责：格式化数字为千分位
 * @param {number} num - 数字
 * @returns {string} 格式化后的字符串
 */
const formatNumber = (num) => {
  if (num === null || num === undefined) return '0';
  return num.toLocaleString('zh-CN');
};

/**
 * 职责：根据采购合同生成购销合同Word文档
 * 思路：
 *   1. 读取模板 DOCX（带 {{placeholder}} 占位符）
 *   2. 提取 word/document.xml
 *   3. 替换占位符为实际数据
 *   4. 重新打包为 DOCX
 * @param {object} purchaseContract - 采购合同数据（含supplier、items等）
 * @param {object} options - 可选配置（storeName, deliveryContact, depositRate）
 * @returns {Buffer} 生成的Word文档Buffer
 */
const generatePurchaseContract = async (purchaseContract, options = {}) => {
  // 0. 检查模板是否存在
  try {
    await fs.access(TEMPLATE_PATH);
  } catch {
    throw new Error('合同模板文件不存在，请先上传模板');
  }
  
  // 1. 读取模板
  const zip = new AdmZip(TEMPLATE_PATH);
  
  // 2. 获取 document.xml
  const documentXml = zip.getEntry('word/document.xml');
  if (!documentXml) {
    throw new Error('无效的 Word 文档模板');
  }
  
  let xmlContent = documentXml.getData().toString('utf8');
  
  // 3. 准备数据
  const supplier = purchaseContract.supplier || {};
  const items = purchaseContract.items || [];
  const firstItem = items[0] || {};
  const product = firstItem.product || {};
  
  // 3.1 税率（从采购合同读取，默认13%）
  const taxRatePercent = purchaseContract.taxRate || 13;
  const taxRate = taxRatePercent / 100;
  
  // 3.2 计算金额
  const totalAmount = items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
  const taxAmount = Math.round(totalAmount * taxRate);
  const grandTotal = totalAmount + taxAmount;
  
  // 3.3 商品金额
  const productAmount = firstItem.totalPrice || 0;
  const productTaxAmount = Math.round(productAmount * taxRate);
  const productGrandTotal = productAmount + productTaxAmount;
  
  // 3.4 日期（使用当前北京时间）
  const now = new Date();
  // 转换为北京时间 (UTC+8)
  const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const signYear = beijingTime.getUTCFullYear();
  const signMonth = beijingTime.getUTCMonth() + 1;
  const signDay = beijingTime.getUTCDate();
  
  // 3.5 合同编号
  const contractNo = generateContractNo(purchaseContract.contractNo);
  
  // 3.6 首付比例
  const depositRate = options.depositRate || 30;
  
  // 3.7 商品单位（从商品信息读取）
  const unit = firstItem.unit || product.unit || '个';
  
  // 4. 定义占位符替换（{{placeholder}} -> 实际值）
  const placeholders = {
    // 合同基本信息
    contractNo: contractNo,
    signYear: String(signYear),
    signMonth: String(signMonth),
    signDay: String(signDay),
    
    // 供应商信息
    supplierName: supplier.name || '【供应商名称】',
    supplierTaxId: supplier.taxId || '【税号】',
    supplierAddress: supplier.address || '【地址】',
    supplierBankName: supplier.bankName || '【开户银行】',
    supplierBankAccount: supplier.bankAccount || '【银行账号】',
    supplierPhone: supplier.phone || '【电话】',
    
    // 收货信息
    storeName: options.storeName || '【店铺名称】',
    deliveryContact: options.deliveryContact || '【联系人】',
    
    // 首付比例
    depositRate: String(depositRate),
    
    // 商品信息
    productName: product.customsName || product.name || '【商品名称】',
    unit: unit,  // 商品单位
    quantity: formatNumber(firstItem.quantity || 0),
    unitPrice: formatNumber(firstItem.unitPrice || 0),
    amount: formatNumber(productAmount),
    
    // 税率和税额
    taxRate: `${taxRatePercent}%`,  // 如 "13%" 或 "1%"
    taxAmount: formatNumber(productTaxAmount),
    totalAmount: formatNumber(productGrandTotal),
    
    // 金额汇总（大写）
    totalAmountChinese: numberToChinese(grandTotal),
  };
  
  // 5. 执行替换
  for (const [key, value] of Object.entries(placeholders)) {
    const placeholder = `{{${key}}}`;
    xmlContent = xmlContent.split(placeholder).join(value);
  }
  
  // 6. 更新 document.xml
  zip.updateFile('word/document.xml', Buffer.from(xmlContent, 'utf8'));
  
  // 7. 生成新的 DOCX
  return zip.toBuffer();
};

/**
 * 职责：生成文件名
 * @param {object} purchaseContract - 采购合同
 * @param {string} storeName - 店铺名称
 * @returns {string} 文件名
 */
const generateFilename = (purchaseContract, storeName) => {
  const contractNo = generateContractNo(purchaseContract.contractNo);
  const firstItem = purchaseContract.items?.[0] || {};
  const productName = firstItem.product?.customsName || firstItem.product?.name || '商品';
  const store = storeName || '店铺';
  
  return `购销合同${contractNo}-${store}-${productName}.docx`;
};

/**
 * 职责：检查模板是否存在
 */
const checkTemplateExists = async () => {
  try {
    await fs.access(TEMPLATE_PATH);
    return true;
  } catch {
    return false;
  }
};

/**
 * 职责：保存上传的模板
 * @param {Buffer} buffer - 模板文件Buffer
 */
const saveTemplate = async (buffer) => {
  await fs.writeFile(TEMPLATE_PATH, buffer);
};

/**
 * 职责：获取模板元信息
 * @returns {Promise<{ exists: boolean; filename?: string; size?: number; updatedAt?: Date }>}
 */
const getTemplateInfo = async () => {
  try {
    const stat = await fs.stat(TEMPLATE_PATH);
    return {
      exists: true,
      filename: path.basename(TEMPLATE_PATH),
      size: stat.size,
      updatedAt: stat.mtime,
    };
  } catch {
    return { exists: false };
  }
};

/**
 * 职责：删除模板文件
 */
const removeTemplate = async () => {
  await fs.unlink(TEMPLATE_PATH);
};

module.exports = {
  generatePurchaseContract,
  generateFilename,
  checkTemplateExists,
  saveTemplate,
  getTemplateInfo,
  removeTemplate,
  numberToChinese,
  generateContractNo,
};
