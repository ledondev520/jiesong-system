const prisma = require('../../../utils/prisma');
const { createError } = require('../../../middleware/errorHandler');

const createSupplier = async ({ input, prismaClient = prisma } = {}) => {
  const data = input || {};
  const name = String(data.name || '').trim();
  if (!name) {
    throw createError('供应商名称不能为空', 400);
  }

  return prismaClient.supplier.create({
    data: {
      name,
      shortName: data.shortName || null,
      contactName: data.contactName || null,
      contactPhone: data.contactPhone || null,
      contactEmail: data.contactEmail || null,
      address: data.address || null,
      phone: data.phone || null,
      taxId: data.taxId || null,
      bankName: data.bankName || null,
      bankAccount: data.bankAccount || null,
    },
  });
};

module.exports = {
  createSupplier,
};
