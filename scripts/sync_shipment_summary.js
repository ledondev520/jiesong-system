/**
 * Input: 从已登录金山文档下载的完整出货汇总、源文件 SHA-256、正式 SQLite
 * Output: 受限差异预览；指定预览摘要后单事务同步，不删除记录、不改收付款与售价
 * Pos: WPS 并行期单向同步 Adapter。下载和最新版本确认由调用者完成。
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const XLSX = require('../backend/node_modules/xlsx');
const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const { roundMoney } = require('../backend/src/services/purchaseAmountService');

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const text = value => value == null ? '' : String(value).trim();
const storeKey = value => text(value).toLowerCase().replace(/^安娜汉姆$/, '安纳汉姆');
// 历史源表名称经同合同箱单与现有装箱行核实；不做模糊名称匹配。
const productKey = value => ({ '铝型材（喷涂）': '铝型材', '玻璃瓶（玻璃酒瓶': '玻璃酒瓶', '电磁炉（餐桌': '餐桌', '泉州铁艺酒架（铁艺屏风': '铁艺酒架屏风', '岩板（瓷砖': '岩板' }[text(value)] || text(value));
const unique = values => [...new Set(values.filter(Boolean))];
const numericColumns = { quantity: '报关数量', boxes: '箱数', grossWeight: '毛重', netWeight: '净重', volume: '体积' };
const textColumns = { unit: '单位', specification: '规格', supplement: '商品补充信息', manufacturer: '厂家', purchaseContractNo: '购销合同号' };
const equal = (a, b) => typeof b === 'number' ? a != null && Math.abs(a - b) < 0.000001 : a === b;
const changes = (old, data) => Object.fromEntries(Object.entries(data).filter(([key, value]) => !equal(old[key], value)));

function parseQuantity(value) {
  const raw = text(value).replace(/,/g, '');
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  // 只接受单个前括号、同单位加法、明确“报”数量；其他注释不猜测。
  const bracket = raw.match(/^[（(](\d+(?:\.\d+)?)[）)]?$/);
  if (bracket) return Number(bracket[1]);
  const sum = raw.match(/^(\d+(?:\.\d+)?)(方|平方米)\+(\d+(?:\.\d+)?)\2$/);
  if (sum) return Number(sum[1]) + Number(sum[3]);
  const declared = raw.match(/^\d+(?:\.\d+)?[（(]报(\d+(?:\.\d+)?)(?:平|平方米)[）)]$/);
  return declared ? Number(declared[1]) : NaN;
}

function parseSource(buffer) {
  // Excel 日期是无时区的日历值；保留序列号，不能经本地 Date 转 UTC 导致减一天。
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheet = workbook.Sheets['出货总清单'];
  if (!sheet) throw new Error('缺少出货总清单');
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  const headers = matrix.shift().map(text);
  for (const name of ['报关名', '门店', '合同号', '出货日期', ...Object.values(numericColumns), ...Object.values(textColumns)]) {
    if (headers.filter(h => h === name).length !== 1) throw new Error(`列缺失或重复：${name}`);
  }
  const quantityFromStoreTotal = cells => {
    const value = (row, column) => row[headers.indexOf(column)];
    const pair = text(value(cells, '报关数量')).match(/^(\d+(?:\.\d+)?)[（(](\d+(?:\.\d+)?)[）)]?$/);
    if (!pair || !(Number(pair[2]) > Number(pair[1]) && Number(pair[1]) > 0)) return NaN;
    // ponytail: 当前数百行表按组扫描；万行以上再给业务键建索引。
    const group = matrix.filter(other => ['报关名', '合同号', '购销合同号', '单位'].every(column => text(value(other, column)) === text(value(cells, column))));
    const stores = group.map(other => storeKey(value(other, '门店')));
    if (group.length < 2 || stores.some(store => !store) || new Set(stores).size !== group.length) return NaN;
    const counts = group.map(other => other === cells ? Number(pair[1]) : parseQuantity(value(other, '报关数量')));
    return counts.every(n => Number.isFinite(n) && n > 0) && equal(counts.reduce((a, b) => a + b, 0), Number(pair[2])) ? Number(pair[1]) : NaN;
  };
  const rows = [], conflicts = [];
  matrix.forEach((cells, i) => {
    const get = name => cells[headers.indexOf(name)];
    if (!text(get('报关名'))) return;
    const row = { row: i + 2, contractNo: text(get('合同号')), productName: text(get('报关名')), storeName: text(get('门店')), portName: text(get('港口')), containerLabel: text(get('柜子编号')), data: {} };
    if (row.productName === '寿司机') row.productName = '寿司饭团机'; // 现有导入器已采用的精确别名。
    try {
      const date = get('出货日期');
      if (date != null && date !== '') {
        const parts = typeof date === 'number' && XLSX.SSF.parse_date_code(date, { date1904: Boolean(workbook.Workbook?.WBProps?.date1904) });
        if (!parts || parts.y < 2000 || parts.y > 2099) throw new Error('出货日期无法识别');
        row.shippedAt = `${parts.y}-${String(parts.m).padStart(2, '0')}-${String(parts.d).padStart(2, '0')}`;
      }
      if (!/^EXP\d{6,8}$/.test(row.contractNo)) throw new Error('缺少正式 EXP 归属');
      const pieceArea = text(get('报关数量')).match(/^(\d+)[（(](\d+(?:\.\d+)?)[）)]?$/);
      const panelSize = text(get('规格')).match(/^(\d+(?:\.\d+)?)[*xX×](\d+(?:\.\d+)?)$/);
      // 此表板材规格以毫米计；只有片数、面积和规格三者一致才拆解双单位。
      const verifiedPieceArea = /^片[（(]平方米[）)]?$/.test(text(get('单位'))) && pieceArea && panelSize
        && Number(pieceArea[1]) > 0 && Number(pieceArea[2]) > 0
        && equal(Number(pieceArea[1]) * Number(panelSize[1]) * Number(panelSize[2]) / 1e6, Number(pieceArea[2]));
      // 采购金额只补空采购成本或核对差异，不能混入装箱售价或覆盖已有金额。
      const cost = get('采购金额');
      if (cost != null && cost !== '') {
        const amount = Number(typeof cost === 'string' ? cost.replace(/,/g, '') : cost);
        if (!Number.isFinite(amount) || amount < 0) throw new Error('采购金额不是有效非负数字');
        row.sourcePurchaseCost = amount;
      }
      for (const [key, column] of Object.entries(numericColumns)) {
        const value = get(column);
        if (value == null || value === '') continue;
        let n = key === 'quantity' ? parseQuantity(value) : Number(typeof value === 'string' ? value.replace(/,/g, '') : value);
        if (key === 'quantity' && verifiedPieceArea) n = Number(pieceArea[1]);
        if (key === 'quantity' && !Number.isFinite(n)) n = quantityFromStoreTotal(cells);
        if (!Number.isFinite(n) || n < 0 || (key === 'boxes' && !Number.isInteger(n))) throw new Error(`${column}不是有效非负数字`);
        row.data[key] = n;
      }
      for (const [key, column] of Object.entries(textColumns)) {
        const value = text(get(column));
        if (value) row.data[key] = value;
      }
      if (verifiedPieceArea) {
        row.data.unit = '片';
        row.data.supplement = [row.data.supplement, `源表对应面积${pieceArea[2]}平方米`].filter(Boolean).join('；');
      }
      rows.push(row);
    } catch (error) {
      conflicts.push({ row: row.row, contractNo: row.contractNo, reason: error.message });
      if (/^EXP\d{6,8}$/.test(row.contractNo)) rows.push({ ...row, invalid: true });
    }
  });
  if (!rows.length) throw new Error('没有正式合同数据');
  return { rows, conflicts };
}

function buildPlan(source, state, today) {
  source = { ...source, rows: source.rows.map(row => ({ ...row, productName: productKey(row.productName) })) };
  const operations = [], conflicts = [...source.conflicts];
  const contracts = new Map(state.contracts.map(c => [c.contractNo, c]));
  const groups = new Map();
  for (const row of source.rows) groups.set(row.contractNo, [...(groups.get(row.contractNo) || []), row]);
  for (const [contractNo, rows] of groups) {
    let contract = contracts.get(contractNo);
    if (!contract) {
      // 与 salesService.createSalesContract 的默认参考汇率一致；源表没有销售价格，不创建销售明细。
      contract = { id: `new:${contractNo}`, contractNo, status: 'DRAFT', exchangeRate: 7, _count: { items: 0, inventories: 0 } };
      operations.push({ model: 'salesContract', create: true, contractNo, data: { contractNo, exchangeRate: 7, status: 'PACKING' } });
    }
    if (contract.status === 'CANCELLED') { conflicts.push({ contractNo, reason: '系统合同已取消' }); continue; }
    const dates = unique(rows.map(r => r.shippedAt));
    const contractData = {};
    if (dates.length === 1 && dates[0] <= today && rows.every(r => r.shippedAt)) {
      if (!['SHIPPED', 'ARRIVED', 'COMPLETED'].includes(contract.status)) {
        // 历史事实补录不能再次触发销售库存扣减；有库存/销售明细的单据交人工核对。
        if (contract._count.items || contract._count.inventories) conflicts.push({ contractNo, reason: '发运状态变化涉及销售明细或库存，需核对后同步' });
        else contractData.status = 'SHIPPED';
      }
      if (!contract.shippedAt || new Date(contract.shippedAt).toISOString().slice(0, 10) !== dates[0]) contractData.shippedAt = `${dates[0]}T00:00:00.000Z`;
    } else if (dates.length) conflicts.push({ contractNo, reason: '出货日期存在冲突、空白或未来日期' });
    const labels = unique(rows.map(r => r.containerLabel));
    if (labels.length === 1) contractData.containerLabel = labels[0];
    else if (labels.length > 1) conflicts.push({ contractNo, reason: '同合同柜子编号不唯一' });
    const existing = state.packing.filter(p => p.salesContractId === contract.id);
    const used = new Set();
    let complete = !source.conflicts.some(c => c.contractNo === contractNo);
    for (const row of rows) {
      if (row.invalid) { complete = false; continue; }
      const keyMatches = r => r.productName === row.productName && storeKey(r.storeName) === storeKey(row.storeName) && (r.data.purchaseContractNo || '') === (row.data.purchaseContractNo || '');
      let duplicates = rows.filter(keyMatches);
      let candidates = existing.filter(p => productKey(p.product.customsName) === row.productName && storeKey(p.store?.name) === storeKey(row.storeName) && (p.purchaseContractNo || '') === (row.data.purchaseContractNo || ''));
      if (!candidates.length && row.data.purchaseContractNo && row.data.quantity > 0 && row.data.specification) {
        const sameGoods = p => productKey(p.product.customsName) === row.productName && storeKey(p.store?.name) === storeKey(row.storeName) && equal(p.quantity, row.data.quantity) && p.specification === row.data.specification;
        const missingNumber = existing.filter(p => !p.purchaseContractNo && sameGoods(p));
        const sourceMatches = rows.filter(r => r.productName === row.productName && storeKey(r.storeName) === storeKey(row.storeName) && equal(r.data.quantity, row.data.quantity) && r.data.specification === row.data.specification);
        if (missingNumber.length === 1 && sourceMatches.length === 1) candidates = missingNumber;
      }
      if (duplicates.length > 1 || candidates.length > 1) {
        // 同一商品可有多批货；数量和箱数必须在源与库中双向唯一，不能按位置配对。
        const batchMatches = data => row.data.quantity > 0 && row.data.boxes > 0 && equal(data.quantity, row.data.quantity) && equal(data.boxes, row.data.boxes);
        duplicates = duplicates.filter(r => batchMatches(r.data));
        candidates = candidates.filter(batchMatches);
        if (duplicates.length > 1 || candidates.length > 1) {
          const weightsMatch = data => row.data.grossWeight > 0 && row.data.netWeight > 0 && equal(data.grossWeight, row.data.grossWeight) && equal(data.netWeight, row.data.netWeight);
          duplicates = duplicates.filter(r => weightsMatch(r.data));
          candidates = candidates.filter(weightsMatch);
        }
        if (candidates.length > 1 && candidates.length === duplicates.length && duplicates.every(r => JSON.stringify(r.data) === JSON.stringify(row.data) && r.sourcePurchaseCost === row.sourcePurchaseCost)) {
          // 同样货物的多个独立行：源库数量相等且目标值完全相同，保持多行，不合并。
          const index = duplicates.indexOf(row);
          candidates = [candidates.sort((a, b) => a.id.localeCompare(b.id))[index]];
          duplicates = [row];
        }
        if (candidates.length !== 1) {
          conflicts.push({ row: row.row, contractNo, reason: '商品、门店、采购合同组合不唯一' }); complete = false; continue;
        }
      }
      if (duplicates.length !== 1 || candidates.length > 1) {
        conflicts.push({ row: row.row, contractNo, reason: '商品、门店、采购合同组合不唯一' }); complete = false; continue;
      }
      const candidate = candidates[0];
      if (candidate) {
        if (used.has(candidate.id)) { conflicts.push({ row: row.row, contractNo, reason: '源行重复匹配同一装箱记录' }); complete = false; continue; }
        used.add(candidate.id);
        if (row.sourcePurchaseCost != null && candidate.purchaseCost == null) {
          operations.push({ model: 'packingItem', id: candidate.id, data: { purchaseCost: row.sourcePurchaseCost }, row: row.row, contractNo });
        } else if (row.sourcePurchaseCost != null && roundMoney(candidate.purchaseCost) !== roundMoney(row.sourcePurchaseCost)) {
          conflicts.push({ row: row.row, contractNo, packingItemId: candidate.id, reason: '采购金额与出货汇总不同，保留原值待核验' });
        }
        const data = changes(candidate, row.data);
        if (Object.keys(data).length) {
          if (candidate._count.customsDeclarationItems || contract._count.inventories || contract._count.items) {
            // 用户确认出货汇总为主准；纠正装箱资料，不改历史报关快照或财务关联。
            const metadata = Object.fromEntries(Object.entries(data).filter(([key]) => ['boxes', 'grossWeight', 'netWeight', 'volume', 'unit', 'specification', 'supplement', 'manufacturer'].includes(key) || (key === 'purchaseContractNo' && !candidate.purchaseContractNo) || (key === 'quantity' && !candidate._count.customsDeclarationItems)));
            if (Object.keys(metadata).length) operations.push({ model: 'packingItem', id: candidate.id, data: metadata, row: row.row, contractNo });
            for (const key of Object.keys(metadata)) delete data[key];
            if (Object.keys(data).length) {
              conflicts.push({ row: row.row, contractNo, reason: '数量变化涉及已有报关、销售或库存关联，需核对分配关系' }); complete = false;
            }
          } else operations.push({ model: 'packingItem', id: candidate.id, data, row: row.row, contractNo });
        }
      } else {
        // 同商品或旧 PENDING 的归属可能变更；不能把弱匹配当新增，避免重复货物。
        const related = state.packing.some(p => productKey(p.product.customsName) === row.productName && (p.salesContractId === contract.id || (p.contractNo.startsWith('PENDING') && storeKey(p.store?.name) === storeKey(row.storeName))));
        const products = state.products.filter(p => productKey(p.customsName) === row.productName);
        const stores = state.stores.filter(s => storeKey(s.name) === storeKey(row.storeName));
        if (related || products.length !== 1 || stores.length !== 1 || !(row.data.quantity > 0)) {
          conflicts.push({ row: row.row, contractNo, reason: '新行主数据或历史归属不能唯一匹配' }); complete = false;
        } else operations.push({ model: 'packingItem', create: true, row: row.row, contractNo, data: { salesContractId: contract.id, productId: products[0].id, storeId: stores[0].id, ...row.data, ...(row.sourcePurchaseCost != null ? { purchaseCost: row.sourcePurchaseCost } : {}) } });
      }
    }
    // 总量仅在源行全部处理且没有遗留系统行时更新，否则避免总表与明细脱节。
    if (complete && existing.every(p => used.has(p.id))) {
      for (const key of ['boxes', 'grossWeight', 'netWeight', 'volume']) {
        if (rows.every(r => r.data[key] != null)) contractData[key === 'boxes' ? 'totalBoxes' : key] = Number(rows.reduce((n, r) => n + r.data[key], 0).toFixed(6));
      }
    } else conflicts.push({ contractNo, reason: '明细尚未完整对齐，保留合同汇总数', unmatchedPackingIds: existing.filter(p => !used.has(p.id)).map(p => p.id) });
    const data = changes(contract, contractData);
    if (contract.id.startsWith('new:')) Object.assign(operations.find(o => o.model === 'salesContract' && o.create && o.contractNo === contractNo).data, data);
    else if (Object.keys(data).length) operations.push({ model: 'salesContract', id: contract.id, data, contractNo });
  }
  return { operations, conflicts };
}

async function readState(db) {
  const [contracts, packing, products, stores, purchases] = await Promise.all([
    db.salesContract.findMany({ orderBy: { id: 'asc' }, include: { _count: { select: { items: true, inventories: true } } } }),
    db.packingItem.findMany({ orderBy: { id: 'asc' }, include: { product: { select: { customsName: true } }, store: { select: { name: true } }, salesContract: { select: { contractNo: true } }, _count: { select: { customsDeclarationItems: true } } } }),
    db.product.findMany({ orderBy: { id: 'asc' }, select: { id: true, customsName: true } }),
    db.store.findMany({ orderBy: { id: 'asc' }, select: { id: true, name: true } }),
    db.purchaseContract.findMany({ orderBy: { id: 'asc' }, select: { contractNo: true, supplier: { select: { name: true } } } }),
  ]);
  return { contracts, packing: packing.map(p => ({ ...p, contractNo: p.salesContract.contractNo })), products, stores, purchases };
}

function savePrivate(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.chmodSync(path.dirname(file), 0o700);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

async function main() {
  const args = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--source', '--sha256', '--out', '--apply-plan'].includes(args[i]) || !args[i + 1]) throw new Error('参数：--source xlsx --sha256 digest --out private.json [--apply-plan previewDigest]');
    options[args[i]] = args[i + 1];
  }
  if (!options['--source'] || !options['--sha256'] || !options['--out']) throw new Error('必须提供来源、校验摘要与受限结果路径');
  const buffer = fs.readFileSync(options['--source']);
  const digest = hash(buffer);
  if (digest !== options['--sha256']) throw new Error('源文件与已核验版本不一致');
  const source = parseSource(buffer), db = new PrismaClient({ log: [] });
  try {
    const state = await readState(db);
    const plan = buildPlan(source, state, new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }));
    const stateDigest = hash(JSON.stringify(state));
    const previewDigest = hash(JSON.stringify({ digest, stateDigest, plan }));
    let applied = false;
    if (options['--apply-plan']) {
      if (options['--apply-plan'] !== previewDigest) throw new Error('来源或数据库已变化，请重新预览');
      await db.$transaction(async tx => {
        if (hash(JSON.stringify(await readState(tx))) !== stateDigest) throw new Error('事务内状态已变化');
        const createdContracts = new Map();
        for (const op of plan.operations) {
          const marker = `[WPS_SYNC:${digest.slice(0, 12)}]`;
          const old = op.model === 'salesContract' ? state.contracts.find(c => c.id === op.id) : state.packing.find(p => p.id === op.id);
          const note = `${old?.note || ''}\n${marker} 出货总清单${op.row ? `#${op.row}` : ''}${op.model === 'salesContract' && op.create ? '；汇率7为系统默认参考值，非云表提供，待财务确认；未导入销售价格。' : ''}`.trim();
          const data = { ...op.data, note };
          if (data.salesContractId?.startsWith('new:')) data.salesContractId = createdContracts.get(op.contractNo);
          if (op.create) {
            const created = await tx[op.model].create({ data });
            if (op.model === 'salesContract') createdContracts.set(op.contractNo, created.id);
          }
          else await tx[op.model].update({ where: { id: op.id }, data: { ...op.data, note } });
        }
      }, { timeout: 30000 });
      applied = true;
    }
    const summary = { sourceRows: source.rows.length, sourceContracts: new Set(source.rows.map(r => r.contractNo)).size, updates: plan.operations.filter(o => !o.create).length, creates: plan.operations.filter(o => o.create).length, conflicts: plan.conflicts.length, applied };
    savePrivate(options['--out'], { source: options['--source'], digest, previewDigest, summary, ...plan });
    console.log(JSON.stringify({ summary, previewDigest }));
  } finally { await db.$disconnect(); }
}

module.exports = { parseSource, buildPlan, parseQuantity };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
