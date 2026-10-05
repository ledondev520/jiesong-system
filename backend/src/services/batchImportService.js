/**
 * 批量导入服务
 * 支持销售合同、采购合同等业务的批量导入；采购逐行原子写入并重试编号/事务竞争
 */

const prisma = require('../utils/prisma');
const { generateNextContractNo } = require('./shared/contractUtils');
const { generateNextPurchaseContractNo, isPurchaseNumberConflict } = require('./purchaseContractNumberService');

const getCurrentYear = () => new Date().getFullYear().toString().slice(-2);

/**
 * 批量导入销售合同
 * @param {Array} data - 导入数据数组
 * @param {string} userId - 操作用户ID
 * @returns {Promise<{success: number, failed: number, errors: Array}>}
 */
async function batchImportSalesContracts(data, userId) {
  const results = { success: 0, failed: 0, errors: [] };

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rowNum = row._rowNum || i + 1;

    try {
      // 获取下一个合同号
      const contractNo = await generateNextContractNo({ prisma, year: getCurrentYear() });

      // 查找商品
      const product = await prisma.product.findFirst({
        where: { customsName: row.productName },
      });

      if (!product) {
        throw new Error(`商品 "${row.productName}" 不存在`);
      }

      // 查找门店
      const store = await prisma.store.findFirst({
        where: { name: row.storeName },
      });

      if (!store) {
        throw new Error(`门店 "${row.storeName}" 不存在`);
      }

      // 创建合同
      const contract = await prisma.salesContract.create({
        data: {
          contractNo,
          status: 'DRAFT',
          exchangeRate: parseFloat(row.exchangeRate) || 7.2,
          totalAmount: parseFloat(row.quantity) * parseFloat(row.sellingPrice),
        },
      });

      // 创建合同明细
      await prisma.salesItem.create({
        data: {
          salesContractId: contract.id,
          productId: product.id,
          storeId: store.id,
          quantity: parseFloat(row.quantity),
          unit: row.unit || '件',
          costPrice: parseFloat(row.costPrice),
          sellingPrice: parseFloat(row.sellingPrice),
        },
      });

      results.success++;
    } catch (error) {
      results.failed++;
      results.errors.push({
        row: rowNum,
        message: error.message,
      });
    }
  }

  return results;
}

/**
 * 批量导入采购合同
 * @param {Array} data - 导入数据数组
 * @param {string} userId - 操作用户ID
 * @returns {Promise<{success: number, failed: number, errors: Array}>}
 */
async function batchImportPurchaseContracts(data, userId) {
  const results = { success: 0, failed: 0, errors: [] };

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rowNum = row._rowNum || i + 1;

    try {
      // 查找供应商
      const supplier = await prisma.supplier.findFirst({
        where: { name: row.supplierName },
      });

      if (!supplier) {
        throw new Error(`供应商 "${row.supplierName}" 不存在`);
      }

      // 查找商品
      const product = await prisma.product.findFirst({
        where: { customsName: row.productName },
      });

      if (!product) {
        throw new Error(`商品 "${row.productName}" 不存在`);
      }

      // 每行独立提交，失败行不留合同头；竞争重试整行，不能只补写明细。
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          await prisma.$transaction(async (tx) => {
            const contract = await tx.purchaseContract.create({
              data: {
                contractNo: row.contractNo || await generateNextPurchaseContractNo(tx),
                supplierId: supplier.id,
                status: 'DRAFT',
                totalAmount: parseFloat(row.quantity) * parseFloat(row.price),
                expectedDate: row.deliveryDate ? new Date(row.deliveryDate) : null,
              },
            });

            await tx.purchaseItem.create({
              data: {
                purchaseContractId: contract.id,
                productId: product.id,
                quantity: parseFloat(row.quantity),
                unit: row.unit || '件',
                unitPrice: parseFloat(row.price),
                totalPrice: parseFloat(row.quantity) * parseFloat(row.price),
              },
            });
          });
          break;
        } catch (error) {
          const retryable = error?.code === 'P2034' || (!row.contractNo && isPurchaseNumberConflict(error));
          if (!retryable) throw error;
          if (attempt === 4) throw new Error('采购编号正在分配，请稍后重试');
        }
      }

      results.success++;
    } catch (error) {
      results.failed++;
      results.errors.push({
        row: rowNum,
        message: error.message,
      });
    }
  }

  return results;
}

module.exports = {
  batchImportSalesContracts,
  batchImportPurchaseContracts,
};
