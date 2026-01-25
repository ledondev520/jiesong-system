/**
 * 职责：将商品-供应商关联数据导入数据库
 * 思路：
 *   1. 读取 CSV 文件
 *   2. 清空现有数据（供应商、商品、采购合同）
 *   3. 导入供应商
 *   4. 导入商品
 *   5. 创建采购合同及明细（建立关联）
 * 
 * Note: 运行前备份数据库！
 */

const fs = require('fs');
const path = require('path');

// 动态加载 prisma（需要从 backend 目录运行）
const backendPath = path.join(__dirname, '../backend');
process.chdir(backendPath);
const { PrismaClient } = require(path.join(backendPath, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();

// CSV 文件路径
const CSV_FILE = path.join(__dirname, '../docs/商品供应商关联表.csv');
// 供应商名录文件（获取详细信息）
const SUPPLIER_DOC = path.join(__dirname, '../docs/供应商名录.md');

/**
 * 解析供应商名录 MD 文件，获取详细信息
 */
function parseSupplierDoc() {
  const content = fs.readFileSync(SUPPLIER_DOC, 'utf-8');
  const suppliers = {};
  
  // 按供应商分块
  const blocks = content.split('---').filter(b => b.includes('## '));
  
  for (const block of blocks) {
    const nameMatch = block.match(/## (.+)/);
    if (!nameMatch) continue;
    
    const name = nameMatch[1].trim();
    const info = {
      name,
      taxId: '',
      address: '',
      bankName: '',
      bankAccount: '',
      phone: '',
    };
    
    // 提取表格中的信息
    const taxMatch = block.match(/纳税人识别号[^\|]*\|\s*([^\|]+)/);
    if (taxMatch && !taxMatch[1].includes('未录入')) info.taxId = taxMatch[1].trim();
    
    const addrMatch = block.match(/地址[^\|]*\|\s*([^\|]+)/);
    if (addrMatch && !addrMatch[1].includes('未录入')) info.address = addrMatch[1].trim().replace(/^:/, '');
    
    const bankMatch = block.match(/收款银行[^\|]*\|\s*([^\|]+)/);
    if (bankMatch && !bankMatch[1].includes('未录入')) info.bankName = bankMatch[1].trim().replace(/^:/, '');
    
    const accountMatch = block.match(/收款账号[^\|]*\|\s*([^\|]+)/);
    if (accountMatch && !accountMatch[1].includes('未录入')) info.bankAccount = accountMatch[1].trim();
    
    const phoneMatch = block.match(/电话[^\|]*\|\s*([^\|]+)/);
    if (phoneMatch && !phoneMatch[1].includes('未录入')) info.phone = phoneMatch[1].trim();
    
    suppliers[name] = info;
  }
  
  return suppliers;
}

/**
 * 解析 CSV 文件
 */
function parseCSV() {
  const content = fs.readFileSync(CSV_FILE, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const header = lines[0].split(',');
  
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const record = {};
    header.forEach((h, idx) => {
      record[h.trim()] = values[idx] ? values[idx].trim() : '';
    });
    records.push(record);
  }
  
  return records;
}

async function main() {
  console.log('=== 开始导入数据 ===\n');
  
  // 0. 解析数据
  console.log('1. 解析数据文件...');
  const supplierDetails = parseSupplierDoc();
  const records = parseCSV();
  console.log(`   - 供应商详情: ${Object.keys(supplierDetails).length} 个`);
  console.log(`   - CSV 记录: ${records.length} 条`);
  
  // 1. 清空现有数据（按依赖顺序）
  console.log('\n2. 清空现有数据...');
  await prisma.purchaseItem.deleteMany({});
  console.log('   - 已清空 PurchaseItem');
  await prisma.purchaseContract.deleteMany({});
  console.log('   - 已清空 PurchaseContract');
  // 注意：不清空商品和供应商，而是更新/新增
  
  // 2. 收集唯一供应商和商品
  const supplierNames = new Set();
  const productMap = new Map(); // name -> { unit, suppliers }
  const contractMap = new Map(); // contractNo -> { supplier, products }
  
  for (const r of records) {
    supplierNames.add(r['供应商名称']);
    
    const productKey = r['商品名称'];
    if (!productMap.has(productKey)) {
      productMap.set(productKey, { unit: r['单位'], suppliers: new Set() });
    }
    productMap.get(productKey).suppliers.add(r['供应商名称']);
    
    const contractNo = r['合同编号'];
    if (!contractMap.has(contractNo)) {
      contractMap.set(contractNo, { 
        supplier: r['供应商名称'], 
        signedAt: r['签订日期'] || '',
        storeName: r['发货店铺'] || '',
        products: [],
        totalAmount: 0,
      });
    }
    const quantity = parseFloat(r['数量']) || 0;
    const unitPrice = parseFloat(r['单价']) || 0;
    const amount = parseFloat(r['金额']) || 0;
    
    contractMap.get(contractNo).products.push({
      name: r['商品名称'],
      unit: r['单位'],
      quantity,
      unitPrice,
      totalPrice: amount || (quantity * unitPrice),
    });
    contractMap.get(contractNo).totalAmount += (amount || (quantity * unitPrice));
  }
  
  // 3. 导入/更新供应商
  console.log('\n3. 导入供应商...');
  const supplierIdMap = new Map(); // name -> id
  
  for (const name of supplierNames) {
    const details = supplierDetails[name] || { name };
    
    // 检查是否已存在
    let supplier = await prisma.supplier.findFirst({ where: { name } });
    
    if (supplier) {
      // 更新
      supplier = await prisma.supplier.update({
        where: { id: supplier.id },
        data: {
          taxId: details.taxId || supplier.taxId,
          address: details.address || supplier.address,
          bankName: details.bankName || supplier.bankName,
          bankAccount: details.bankAccount || supplier.bankAccount,
          phone: details.phone || supplier.phone,
        },
      });
    } else {
      // 新建
      supplier = await prisma.supplier.create({
        data: {
          name,
          taxId: details.taxId || null,
          address: details.address || null,
          bankName: details.bankName || null,
          bankAccount: details.bankAccount || null,
          phone: details.phone || null,
          hasQualityIssue: false,
          isActive: true,
        },
      });
    }
    
    supplierIdMap.set(name, supplier.id);
    console.log(`   + ${name}`);
  }
  console.log(`   共 ${supplierIdMap.size} 个供应商`);
  
  // 4. 导入/更新商品
  console.log('\n4. 导入商品...');
  const productIdMap = new Map(); // name -> id
  
  for (const [name, info] of productMap.entries()) {
    // 检查是否已存在
    let product = await prisma.product.findFirst({ 
      where: { customsName: name } 
    });
    
    if (product) {
      // 更新
      product = await prisma.product.update({
        where: { id: product.id },
        data: {
          unit: info.unit || product.unit,
        },
      });
    } else {
      // 新建
      product = await prisma.product.create({
        data: {
          customsName: name,
          unit: info.unit || '个',
          isActive: true,
        },
      });
    }
    
    productIdMap.set(name, product.id);
    console.log(`   + ${name} (${info.unit})`);
  }
  console.log(`   共 ${productIdMap.size} 个商品`);
  
  // 5. 创建采购合同及明细
  console.log('\n5. 创建采购合同...');
  let contractCount = 0;
  let itemCount = 0;
  
  for (const [contractNo, data] of contractMap.entries()) {
    const supplierId = supplierIdMap.get(data.supplier);
    if (!supplierId) continue;
    
    // 解析签订日期
    let signedAt = new Date();
    if (data.signedAt && /^\d{4}-\d{2}-\d{2}$/.test(data.signedAt)) {
      signedAt = new Date(data.signedAt);
    }
    
    // 创建采购合同（使用计算的总金额）
    const contract = await prisma.purchaseContract.create({
      data: {
        contractNo,
        supplierId,
        status: 'COMPLETED',
        signedAt,
        totalAmount: data.totalAmount || 0,
        paidAmount: data.totalAmount || 0, // 假设已完成的合同已付款
        storeName: data.storeName || null,
        taxRate: 13,
      },
    });
    contractCount++;
    
    // 创建采购明细
    for (const prod of data.products) {
      const productId = productIdMap.get(prod.name);
      if (!productId) continue;
      
      await prisma.purchaseItem.create({
        data: {
          purchaseContractId: contract.id,
          productId,
          quantity: prod.quantity || 1,
          unit: prod.unit || '个',
          unitPrice: prod.unitPrice || 0,
          totalPrice: prod.totalPrice || 0,
        },
      });
      itemCount++;
    }
    
    const amountStr = data.totalAmount > 0 ? `¥${data.totalAmount.toLocaleString()}` : '';
    console.log(`   + ${contractNo}: ${data.products.length} 个商品 ${amountStr}`);
  }
  
  console.log(`\n=== 导入完成 ===`);
  console.log(`供应商: ${supplierIdMap.size} 个`);
  console.log(`商品: ${productIdMap.size} 个`);
  console.log(`采购合同: ${contractCount} 份`);
  console.log(`采购明细: ${itemCount} 条`);
}

main()
  .catch(e => {
    console.error('导入失败:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
