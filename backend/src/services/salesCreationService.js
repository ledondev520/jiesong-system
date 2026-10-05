/**
 * Input: 出口合同表头、可选销售明细、认证操作者与请求键
 * Output: 原子创建及相同请求重放；失败不留下空合同或部分明细
 * Pos: 复用 OperationLog 的既有主键和幂等字段，无需新增表；请求记录只存摘要
 */
const { createHash } = require('node:crypto');
const prisma = require('../utils/prisma');
const { createError } = require('../middleware/errorHandler');
const { generateNextContractNo } = require('./shared/contractUtils');

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text = (value, label, required = false, max = 2000) => {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) {
    throw createError(`${label}无效或未填写`, 400);
  }
  return value.trim() || null;
};
const number = (value, label) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > Number.MAX_SAFE_INTEGER) {
    throw createError(`${label}必须为正数`, 400);
  }
  return value;
};

const normalizeCreation = (data) => {
  if (!['number', 'string'].includes(typeof data.exchangeRate)) throw createError('汇率必须为正数', 400);
  const exchangeRate = number(Number(data.exchangeRate), '汇率');
  const signedAt = data.signedAt ? new Date(data.signedAt) : null;
  if (signedAt && !Number.isFinite(signedAt.getTime())) throw createError('签订日期无效', 400);
  let items = null;
  if (data.items !== undefined) {
    if (!Array.isArray(data.items) || !data.items.length || data.items.length > 100) {
      throw createError('每次需提供1至100条销售明细', 400);
    }
    items = data.items.map(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw createError('销售明细格式无效', 400);
      const costPrice = number(item.costPrice, '成本');
      return {
        productId: text(item.productId, '商品', true, 128),
        storeId: text(item.storeId, '门店', true, 128),
        quantity: number(item.quantity, '数量'),
        unit: text(item.unit, '单位', false, 50),
        costPrice,
        sellingPrice: number(item.sellingPrice === undefined ? costPrice / exchangeRate * 1.3 : item.sellingPrice, '售价'),
        specification: text(item.specification, '规格'),
        note: text(item.note, '明细备注'),
      };
    });
  }
  return {
    contractNo: text(data.contractNo, '合同编号', false, 100),
    exchangeRate,
    signedAt: signedAt?.toISOString() || null,
    note: text(data.note, '备注'),
    items,
  };
};

const createSalesContractAtomically = async (data, context = {}) => {
  const input = normalizeCreation(data);
  const requestKey = text(context.idempotencyKey, '请求键', false, 128);
  const actor = context.actor || {};
  const actorId = actor.actorType === 'AGENT' ? actor.agentAccountId : actor.userId;
  if (requestKey && !actorId) throw createError('创建请求缺少认证操作者', 400);
  const requestHash = hash(input);
  const requestId = requestKey ? `sales-create:${hash([actor.actorType || 'USER', actorId, requestKey])}` : null;
  // 合同主键也锚定请求：即使未来清理通用日志，旧请求也不能悄悄创建第二张合同。
  const contractId = requestId ? `sales-${hash(requestId)}` : null;

  try {
    return await prisma.$transaction(async tx => {
      let request;
      if (requestId) {
        // 先写入既有日志表以获取 SQLite 写锁，再检查重放与编号；不会先读后写造成并发空单。
        request = await tx.operationLog.upsert({
          where: { id: requestId },
          create: {
            id: requestId,
            actorType: actor.actorType || 'USER',
            userId: actor.actorType === 'AGENT' ? null : actor.userId,
            agentAccountId: actor.actorType === 'AGENT' ? actor.agentAccountId : null,
            agentCredentialId: actor.actorType === 'AGENT' ? actor.agentCredentialId : null,
            action: 'IDEMPOTENCY',
            entity: 'SalesCreationRequest',
            idempotencyKey: requestId,
            newValue: JSON.stringify({ requestHash }),
          },
          update: { entity: 'SalesCreationRequest' },
        });
        if (request.newValue !== JSON.stringify({ requestHash })) throw createError('相同请求键不能用于不同的合同内容', 409);
        if (request.entityId) {
          const existing = await tx.salesContract.findUnique({ where: { id: request.entityId }, include: { items: true } });
          if (!existing) throw createError('该创建请求对应的合同已删除，请重新创建', 409);
          return { ...existing, idempotentReplay: true };
        }
        if (await tx.salesContract.findUnique({ where: { id: contractId }, select: { id: true } })) {
          throw createError('该创建请求已完成，但校验记录已清理，请在合同列表核对', 409);
        }
      }

      if (input.items) {
        const productIds = [...new Set(input.items.map(item => item.productId))];
        const storeIds = [...new Set(input.items.map(item => item.storeId))];
        const [products, stores] = await Promise.all([
          tx.product.count({ where: { id: { in: productIds } } }),
          tx.store.count({ where: { id: { in: storeIds } } }),
        ]);
        if (products !== productIds.length || stores !== storeIds.length) throw createError('商品或门店已不存在，请刷新后重新选择', 400);
      }
      const contractNo = input.contractNo || await generateNextContractNo({ prisma: tx, year: new Date().getFullYear().toString().slice(-2) });
      const totalAmount = (input.items || []).reduce((sum, item) => sum + item.quantity * item.sellingPrice, 0);
      if (!Number.isFinite(totalAmount) || totalAmount > Number.MAX_SAFE_INTEGER) throw createError('合同金额超出支持范围', 400);
      const contract = await tx.salesContract.create({
        data: {
          ...(contractId ? { id: contractId } : {}),
          contractNo,
          exchangeRate: input.exchangeRate,
          signedAt: input.signedAt ? new Date(input.signedAt) : null,
          note: input.note,
          totalAmount: Number(totalAmount.toFixed(2)),
          ...(input.items ? { items: { create: input.items } } : {}),
        },
        include: { items: true },
      });
      if (requestId) await tx.operationLog.update({ where: { id: requestId }, data: { entityId: contract.id } });
      return { ...contract, idempotentReplay: false };
    });
  } catch (error) {
    if (error.code === 'P2002') throw createError('合同编号已存在，请核对或修改编号后重试', 409);
    throw error;
  }
};

module.exports = { createSalesContractAtomically, normalizeCreation };
