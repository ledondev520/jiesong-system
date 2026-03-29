const prisma = require('../../../utils/prisma');

const updatePurchase = async ({ id, input, prismaClient = prisma } = {}) => {
  return prismaClient.purchaseContract.update({
    where: { id },
    data: {
      taxRate: input?.taxRate !== undefined ? input.taxRate : undefined,
      signedAt: input?.signedAt ? new Date(input.signedAt) : undefined,
      expectedDate: input?.expectedDate ? new Date(input.expectedDate) : undefined,
      invoiceNo: input?.invoiceNo,
      note: input?.note,
    },
    include: { supplier: true },
  });
};

module.exports = {
  updatePurchase,
};
