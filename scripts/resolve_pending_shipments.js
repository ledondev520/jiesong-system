/**
 * Input: 已核验完整出货汇总、SHA-256、当前 PENDING 与正式合同关联
 * Output: 受限归并预览；按预览摘要事务迁移无下游引用的占位，保留有歧义的记录
 * Pos: 出货同步后的 PENDING 清理 Adapter。调用者写入前完成 SQLite 备份。
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const { parseSource } = require('./sync_shipment_summary');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const norm = value => String(value || '').trim().toLowerCase();
// 零数量、无售价的占位可并入已有正式售价行，但人民币采购金额必须一致且目标金额不改。
const sameMoney = (a, b) => a.purchaseCost === b.purchaseCost && !a.unitPrice && !a.totalPrice;
const hasRefs = row => Object.values(row._count || {}).some(n => n > 0);

function planResolution(source, state) {
  const operations = [], blocked = [];
  const valid = source.rows.filter(r => !r.invalid && r.data.quantity > 0);
  for (const contract of state.contracts.filter(c => c.contractNo.startsWith('PENDING-'))) {
    const store = contract.contractNo.slice('PENDING-'.length);
    for (const item of state.packing.filter(p => p.salesContractId === contract.id)) {
      const candidates = valid.filter(r => r.productName === item.product.customsName && norm(r.storeName) === norm(item.store?.name)
        && (!item.purchaseContractNo || r.data.purchaseContractNo === item.purchaseContractNo)
        && (item.quantity === 0 || item.quantity === r.data.quantity));
      if (hasRefs(item) || item.purchaseItemId || item.unitPrice || item.totalPrice || candidates.length !== 1) {
        blocked.push({ contractNo: contract.contractNo, model: 'packingItem', id: item.id, reason: hasRefs(item) ? '保留报关引用链' : '数量、金额或正式归属不能唯一确认' }); continue;
      }
      const row = candidates[0], target = state.contracts.find(c => c.contractNo === row.contractNo);
      if (!target || target.status === 'CANCELLED') continue;
      const existing = state.packing.filter(p => p.salesContractId === target.id && p.productId === item.productId && p.storeId === item.storeId);
      if (existing.length === 1 && existing[0].quantity === row.data.quantity && sameMoney(item, existing[0]) && item.purchaseContractNo === existing[0].purchaseContractNo && item.quantity === 0) {
        operations.push({ kind: 'merge', model: 'packingItem', id: item.id, targetId: existing[0].id, sourceRow: row.row, from: contract.contractNo, to: target.contractNo });
      } else if (existing.length === 0) {
        operations.push({ kind: 'move', model: 'packingItem', id: item.id, data: { salesContractId: target.id, ...row.data }, sourceRow: row.row, from: contract.contractNo, to: target.contractNo });
      } else blocked.push({ contractNo: contract.contractNo, model: 'packingItem', id: item.id, reason: '正式合同已有非等价行，不能重复迁移' });
    }
    for (const item of state.inventory.filter(p => p.salesContractId === contract.id)) {
      const candidates = valid.filter(r => r.productName === item.product.customsName && norm(r.storeName) === norm(store) && r.data.quantity === item.quantity);
      if (item.purchaseItemId || item.salesItemId || candidates.length !== 1) {
        blocked.push({ contractNo: contract.contractNo, model: 'inventory', id: item.id, reason: '库存归属不能唯一确认' }); continue;
      }
      const row = candidates[0], target = state.contracts.find(c => c.contractNo === row.contractNo);
      const official = target && state.packing.filter(p => p.salesContractId === target.id && p.productId === item.productId && norm(p.store?.name) === norm(store) && p.quantity === item.quantity);
      if (!target || official.length !== 1 || state.inventory.some(p => p.salesContractId === target.id && p.productId === item.productId)) {
        blocked.push({ contractNo: contract.contractNo, model: 'inventory', id: item.id, reason: '正式装箱与库存不能唯一对应' }); continue;
      }
      const data = { salesContractId: target.id };
      if (['SHIPPED', 'ARRIVED', 'COMPLETED'].includes(target.status) && row.shippedAt && target.shippedAt && new Date(target.shippedAt).toISOString().slice(0, 10) === row.shippedAt) {
        data.status = 'OUTBOUND'; data.outboundAt = `${row.shippedAt}T00:00:00.000Z`;
      }
      operations.push({ kind: 'move', model: 'inventory', id: item.id, data, sourceRow: row.row, from: contract.contractNo, to: target.contractNo });
    }
  }
  return { operations, blocked };
}

async function readState(db) {
  const [contracts, packing, inventory] = await Promise.all([
    db.salesContract.findMany({ orderBy: { id: 'asc' }, include: { _count: true } }),
    db.packingItem.findMany({ orderBy: { id: 'asc' }, include: { product: { select: { customsName: true } }, store: { select: { name: true } }, _count: true } }),
    db.inventory.findMany({ orderBy: { id: 'asc' }, include: { product: { select: { customsName: true } } } }),
  ]);
  return { contracts, packing, inventory };
}

async function main() {
  const args = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--source', '--sha256', '--out', '--apply-plan'].includes(args[i]) || !args[i + 1]) throw new Error('参数无效');
    options[args[i]] = args[i + 1];
  }
  if (!options['--source'] || !options['--sha256'] || !options['--out']) throw new Error('必须提供 --source --sha256 --out');
  const buffer = fs.readFileSync(options['--source']), digest = hash(buffer);
  if (digest !== options['--sha256']) throw new Error('来源版本不一致');
  const source = parseSource(buffer), db = new PrismaClient({ log: [] });
  try {
    const state = await readState(db), stateDigest = hash(JSON.stringify(state)), plan = planResolution(source, state);
    const previewDigest = hash(JSON.stringify({ digest, stateDigest, plan }));
    const deletedContracts = [];
    if (options['--apply-plan']) {
      if (options['--apply-plan'] !== previewDigest) throw new Error('预览已失效');
      await db.$transaction(async tx => {
        if (hash(JSON.stringify(await readState(tx))) !== stateDigest) throw new Error('数据库已发生变化');
        for (const op of plan.operations) {
          const original = (op.model === 'packingItem' ? state.packing : state.inventory).find(p => p.id === op.id);
          const marker = `[WPS_PENDING_RESOLVED] ${op.from} -> ${op.to}，出货总清单#${op.sourceRow}`;
          if (op.kind === 'merge') {
            const target = state.packing.find(p => p.id === op.targetId);
            await tx.packingItem.update({ where: { id: op.targetId }, data: { note: [target.note, marker, original.note].filter(Boolean).join('\n') } });
            await tx.packingItem.delete({ where: { id: op.id } });
          } else await tx[op.model].update({ where: { id: op.id }, data: { ...op.data, note: [original.note, marker].filter(Boolean).join('\n') } });
        }
        // 全部关联、金额均为零才移除父占位；报关、结汇和退税链不会被级联删除。
        const pending = await tx.salesContract.findMany({ where: { contractNo: { startsWith: 'PENDING-' } }, include: { _count: true } });
        for (const c of pending) {
          if (hasRefs(c) || c.totalAmount !== 0 || c.receivedAmount !== 0) continue;
          deletedContracts.push(c.contractNo);
          await tx.salesContract.delete({ where: { id: c.id } });
        }
      }, { timeout: 30000 });
    }
    const receipt = { digest, previewDigest, applied: Boolean(options['--apply-plan']), ...plan, deletedContracts };
    fs.mkdirSync(path.dirname(options['--out']), { recursive: true, mode: 0o700 });
    fs.chmodSync(path.dirname(options['--out']), 0o700);
    fs.writeFileSync(options['--out'], JSON.stringify(receipt, null, 2), { mode: 0o600 });
    fs.chmodSync(options['--out'], 0o600);
    console.log(JSON.stringify({ previewDigest, applied: receipt.applied, operations: plan.operations.length, blocked: plan.blocked.length, deletedContracts }));
  } finally { await db.$disconnect(); }
}
module.exports = { planResolution };
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
