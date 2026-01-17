/**
 * Input: update0117.csv增量数据
 * Output: 新增数据导入SQLite数据库
 * Pos: 增量数据导入脚本
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const Papa = require('papaparse');

const prisma = new PrismaClient();

// 港口映射
const PORT_MAP = {
  '洛杉矶': { name: '洛杉矶', code: 'LA' },
  'Oakland': { name: 'Oakland', code: 'OAK' },
  '密歇根': { name: '密歇根', code: 'MI' },
  'Oakland和洛杉矶': { name: 'Oakland', code: 'OAK' }, // 多港口取第一个
};

// 供应商昵称映射
const SUPPLIER_ALIASES = {
  '黎总': '佛山陶瓷有限公司',
  '叶总': '叶总餐饮设备',
  '郭总': '郭总金属制品',
  '阿宗': '振宗石材',
  '振宗': '振宗石材',
  '刘总': '刘总家具',
  '淘宝': '淘宝在线采购',
  '何总布菲传奇': '布菲传奇设备',
  '涂经理': '涂经理机械公司',
  '南常': '南常厨房设备',
  '徐州玻璃瓶': '徐州玻璃瓶厂',
  '深圳陈小姐': '深圳照明公司',
  '深圳杨总': '深圳电子公司',
  '泉州林总': '泉州工艺品厂',
  '新兴石材': '新兴石材厂',
  '王总定制': '王总餐具厂',
  '王总': '王总餐具厂',
  '台德': '台德餐具公司',
  '廊坊秀儿商贸': '廊坊秀儿商贸有限公司',
  '宜拓': '宜拓设备',
  '亚克力': '亚克力定制厂',
};

// 辅助函数
function parseAmount(value) {
  if (!value || value === '') return null;
  const cleaned = String(value).replace(/"/g, '').replace(/,/g, '').replace(/\s/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseQuantity(value) {
  if (!value || value === '') return null;
  const cleaned = String(value).replace(/（/g, '').replace(/）/g, '').replace(/=/g, '').replace(/\s/g, '').trim();
  const match = cleaned.match(/^[\d.]+/);
  if (match) {
    const num = parseFloat(match[0]);
    return isNaN(num) ? null : num;
  }
  return null;
}

function parseDate(dateStr) {
  if (!dateStr || dateStr === '') return null;
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
  }
}

function standardizeUnit(unit) {
  if (!unit) return null;
  return unit.replace(/（/g, '').replace(/）/g, '').trim() || null;
}

function standardizeContainerNo(no, date, portCode) {
  if (!no) return null;
  if (/^\d{2}-\d{3}-[A-Z]+$/.test(no)) return no;
  const dateObj = parseDate(date);
  const year = dateObj ? dateObj.getFullYear().toString().slice(-2) : '25';
  const match = no.match(/(\d+)/);
  const seq = match ? match[1].padStart(3, '0') : '001';
  return `${year}-${seq}-${portCode || 'OAK'}`;
}

function getPortInfo(portName) {
  if (!portName) return null;
  return PORT_MAP[portName.trim()] || null;
}

function extractStatus(note, shippedAt) {
  if (!note) return shippedAt ? 'SHIPPED' : 'PENDING';
  if (note.includes('生产中')) return 'PRODUCING';
  if (note.includes('运输中')) return 'SHIPPING';
  if (note.includes('包装中')) return 'PACKING';
  if (shippedAt) return 'SHIPPED';
  return 'PENDING';
}

// 主函数
async function main() {
  console.log('========================================');
  console.log('   增量数据导入工具');
  console.log('========================================');
  
  // 1. 读取新CSV文件
  const csvPath = path.join(__dirname, '../../update0117.csv');
  console.log(`\n📂 读取文件: ${csvPath}`);
  
  if (!fs.existsSync(csvPath)) {
    console.error('❌ CSV文件不存在!');
    process.exit(1);
  }
  
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const parsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
  
  console.log(`   总行数: ${parsed.data.length}`);
  
  // 2. 获取已导入的序号
  const existingItems = await prisma.containerItem.findMany({
    select: { note: true },
  });
  
  // 从note中提取原始序号（如果有的话）
  // 由于之前没有存储序号，我们用商品+货柜作为唯一标识
  
  // 3. 找出新增记录（序号 >= 346 或其他新增的）
  const newRows = [];
  const missingSeq = [];
  let lastSeq = 0;
  
  for (const row of parsed.data) {
    const seq = parseInt(row['序号']);
    
    // 检查序号连续性
    if (seq && seq > lastSeq + 1 && lastSeq > 0) {
      for (let i = lastSeq + 1; i < seq; i++) {
        missingSeq.push(i);
      }
    }
    if (seq) lastSeq = Math.max(lastSeq, seq);
    
    // 收集序号 >= 346 的新记录
    if (seq >= 346) {
      newRows.push(row);
    }
  }
  
  console.log(`\n📊 分析结果:`);
  console.log(`   新增记录: ${newRows.length} 条 (序号 >= 346)`);
  console.log(`   缺失序号: ${missingSeq.length > 0 ? missingSeq.join(', ') : '无'}`);
  
  // 4. 输出缺失序号详情
  if (missingSeq.length > 0) {
    console.log('\n⚠️ 以下序号在CSV中缺失，请补充:');
    missingSeq.forEach(seq => {
      console.log(`   - 序号 ${seq}: 需要补充数据`);
    });
  }
  
  // 5. 导入新增记录
  if (newRows.length > 0) {
    console.log('\n💾 开始导入新增记录...');
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const row of newRows) {
      try {
        const customsName = (row['报关名'] || '').trim();
        const storeName = (row['门店'] || '').trim();
        const portName = (row['港口'] || '').trim();
        
        if (!customsName) {
          console.log(`   ⚠️ 序号 ${row['序号']}: 报关名为空，跳过`);
          errorCount++;
          continue;
        }
        
        // 获取或创建港口
        const portInfo = getPortInfo(portName);
        let port = null;
        if (portInfo) {
          port = await prisma.port.findUnique({ where: { code: portInfo.code } });
          if (!port) {
            port = await prisma.port.create({
              data: { name: portInfo.name, code: portInfo.code, isActive: true },
            });
          }
        }
        
        // 获取或创建商品
        let product = await prisma.product.findFirst({ where: { customsName } });
        if (!product) {
          product = await prisma.product.create({
            data: {
              customsName,
              description: (row['商品补充信息'] || '').trim() || null,
              specification: (row['规格'] || '').trim() || null,
              unit: standardizeUnit(row['单位']),
              isActive: true,
            },
          });
          console.log(`   📦 新建商品: ${customsName}`);
        }
        
        // 获取或创建门店
        let store = null;
        if (storeName && port) {
          store = await prisma.store.findFirst({ where: { name: storeName } });
          if (!store) {
            store = await prisma.store.create({
              data: { name: storeName, portId: port.id, isActive: true },
            });
            console.log(`   🏪 新建门店: ${storeName}`);
          }
        }
        
        // 获取或创建供应商
        const supplierAlias = (row['厂家'] || '').trim();
        let supplier = null;
        if (supplierAlias) {
          const supplierName = SUPPLIER_ALIASES[supplierAlias] || supplierAlias;
          supplier = await prisma.supplier.findFirst({ where: { name: supplierName } });
          if (!supplier) {
            supplier = await prisma.supplier.create({
              data: { name: supplierName, shortName: supplierAlias, isActive: true },
            });
            console.log(`   👥 新建供应商: ${supplierName}`);
          }
        }
        
        // 处理货柜
        const shippedAt = parseDate(row['出货日期']);
        const containerNoRaw = (row['柜子编号'] || '').trim();
        const containerNo = containerNoRaw ? standardizeContainerNo(containerNoRaw, row['出货日期'], portInfo?.code) : null;
        
        let container = null;
        if (containerNo && port) {
          container = await prisma.container.findUnique({ where: { containerNo } });
          if (!container) {
            container = await prisma.container.create({
              data: {
                containerNo,
                portId: port.id,
                status: shippedAt ? 'SHIPPED' : 'PENDING',
                shippedAt,
                customsBroker: (row['报关公司'] || '').trim() || null,
                isFumigated: row['是否熏蒸'] === '是',
                note: containerNoRaw !== containerNo ? `原编号: ${containerNoRaw}` : null,
              },
            });
            console.log(`   🚢 新建货柜: ${containerNo}`);
          }
        }
        
        // 处理销售合同
        const salesContractNo = (row['合同号'] || '').trim();
        let salesContract = null;
        if (salesContractNo) {
          salesContract = await prisma.salesContract.findUnique({ where: { contractNo: salesContractNo } });
          if (!salesContract) {
            salesContract = await prisma.salesContract.create({
              data: {
                contractNo: salesContractNo,
                totalAmount: 0,
                receivedAmount: 0,
                exchangeRate: 7.0,
                status: shippedAt ? 'COMPLETED' : 'DRAFT',
                signedAt: shippedAt,
              },
            });
            console.log(`   📄 新建销售合同: ${salesContractNo}`);
          }
        }
        
        // 处理采购合同
        const purchaseContractNo = (row['购销合同号'] || '').trim();
        const purchaseAmount = parseAmount(row['采购金额']);
        
        if (purchaseContractNo && supplier) {
          let purchaseContract = await prisma.purchaseContract.findUnique({ where: { contractNo: purchaseContractNo } });
          if (!purchaseContract) {
            await prisma.purchaseContract.create({
              data: {
                contractNo: purchaseContractNo,
                supplierId: supplier.id,
                totalAmount: purchaseAmount || 0,
                paidAmount: row['是否付款'] === '1' || row['是否付款'] === '是' ? purchaseAmount || 0 : 0,
                invoiceNo: (row['发票号码'] || '').trim() || null,
                signedAt: shippedAt,
                status: 'COMPLETED',
              },
            });
            console.log(`   📋 新建采购合同: ${purchaseContractNo}`);
          }
        }
        
        // 创建装箱明细
        if (container) {
          await prisma.containerItem.create({
            data: {
              containerId: container.id,
              productId: product.id,
              storeId: store?.id,
              quantity: parseQuantity(row['报关数量']) || 0,
              unit: standardizeUnit(row['单位']),
              boxes: parseInt(row['箱数']) || null,
              grossWeight: parseAmount(row['毛重']),
              netWeight: parseAmount(row['净重']),
              volume: parseAmount(row['体积']),
              note: `序号${row['序号']}: ${(row['备注'] || '').trim()}`,
            },
          });
        }
        
        // 创建库存记录
        const quantity = parseQuantity(row['报关数量']);
        if (quantity && quantity > 0) {
          await prisma.inventory.create({
            data: {
              productId: product.id,
              containerId: container?.id,
              quantity,
              unit: standardizeUnit(row['单位']),
              status: extractStatus(row['备注'], shippedAt),
              outboundAt: shippedAt,
              note: `序号${row['序号']}: ${(row['备注'] || '').trim()}`,
            },
          });
        }
        
        console.log(`   ✅ 序号 ${row['序号']}: ${customsName} - 导入成功`);
        successCount++;
        
      } catch (error) {
        console.log(`   ❌ 序号 ${row['序号']}: 导入失败 - ${error.message}`);
        errorCount++;
      }
    }
    
    console.log('\n========================================');
    console.log(`   导入完成: 成功 ${successCount}, 失败 ${errorCount}`);
    console.log('========================================');
  }
  
  // 6. 检查所有序号的连续性
  console.log('\n📋 序号完整性检查:');
  const allSeqs = parsed.data.map(r => parseInt(r['序号'])).filter(n => !isNaN(n)).sort((a, b) => a - b);
  const minSeq = allSeqs[0];
  const maxSeq = allSeqs[allSeqs.length - 1];
  console.log(`   序号范围: ${minSeq} - ${maxSeq}`);
  
  const allMissing = [];
  for (let i = minSeq; i <= maxSeq; i++) {
    if (!allSeqs.includes(i)) {
      allMissing.push(i);
    }
  }
  
  if (allMissing.length > 0) {
    console.log('\n⚠️ 以下序号在CSV中完全缺失:');
    allMissing.forEach(seq => {
      console.log(`   - 序号 ${seq}`);
    });
    console.log('\n请检查原始数据，确认这些序号的记录是否需要补充。');
  } else {
    console.log('   ✅ 所有序号连续，无缺失');
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
