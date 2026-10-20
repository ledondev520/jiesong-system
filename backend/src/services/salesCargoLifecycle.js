/**
 * Input: 出口合同状态、出库证据与装箱明细变更
 * Output: 发运后货物数量/单位与出库记录的一致性约束
 * Pos: 销售及旧货柜入口共享；单证、价格和历史资料补录仍可进行
 */
const { createError } = require('../middleware/errorHandler');
const { SALES_STATUS, normalizeSalesStatus } = require('./salesStateMachine');

const isSalesCargoLocked = (contract) => [
  SALES_STATUS.SHIPPED,
  SALES_STATUS.ARRIVED,
  SALES_STATUS.COMPLETED,
].includes(normalizeSalesStatus(contract.status)) || Boolean(contract.inventories?.length);

const getSalesCargoState = async (tx, id) => {
  const contract = await tx.salesContract.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      // 历史入口可能留下错误状态；已有出库事实不能因表头状态改变而失去保护。
      inventories: { where: { status: 'OUTBOUND' }, select: { id: true }, take: 1 },
    },
  });
  if (!contract) throw createError('出口合同不存在', 404);
  return contract;
};

const assertSalesCargoMutable = (contract) => {
  if (isSalesCargoLocked(contract)) {
    throw createError('合同已发运或已有出库记录，不能增删装箱商品或删除合同', 400);
  }
};

const SOURCE_LOCKED_PACKING_FIELDS = Object.freeze([
  'quantity',
  'boxes',
  'grossWeight',
  'netWeight',
  'volume',
  'length',
  'width',
  'height',
]);

const SOURCE_LOCKED_PACKING_LABELS = Object.freeze({
  quantity: '数量',
  boxes: '箱数',
  grossWeight: '毛重',
  netWeight: '净重',
  volume: '体积',
  length: '长度',
  width: '宽度',
  height: '高度',
});

const hasOwn = (value, field) => Object.prototype.hasOwnProperty.call(value, field);

const samePackingNumber = (current, next) => {
  const currentNumber = current === null || current === undefined || current === '' ? 0 : Number(current);
  const nextNumber = next === null || next === undefined || next === '' ? 0 : Number(next);
  return Number.isFinite(currentNumber)
    && Number.isFinite(nextNumber)
    && Math.abs(currentNumber - nextNumber) <= 0.000001;
};

const assertSalesCargoUpdate = (contract, item, data) => {
  if (item.purchaseItemId) {
    const changedField = SOURCE_LOCKED_PACKING_FIELDS.find((field) => (
      hasOwn(data, field) && !samePackingNumber(item[field], data[field])
    ));
    if (changedField) {
      throw createError(
        `该装箱明细来源于采购，${SOURCE_LOCKED_PACKING_LABELS[changedField]}由导入比例锁定；若需调整，请删除后重新按箱数导入`,
        400,
      );
    }
  }

  if (!isSalesCargoLocked(contract)) return;
  const quantityChanged = data.quantity !== undefined
    && (!Number.isFinite(Number(data.quantity)) || Math.abs(Number(data.quantity) - Number(item.quantity)) > 0.000001);
  const unitChanged = data.unit !== undefined
    && String(data.unit || '').trim() !== String(item.unit || '').trim();
  if (quantityChanged || unitChanged) {
    throw createError('合同已发运或已有出库记录，不能修改装箱数量或单位；可继续补充单证资料', 400);
  }
};

module.exports = { getSalesCargoState, assertSalesCargoMutable, assertSalesCargoUpdate };
