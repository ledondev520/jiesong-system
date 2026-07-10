const prisma = require('../../../utils/prisma');

const updateSupplier = async ({ id, input, prismaClient = prisma } = {}) => {
  return prismaClient.supplier.update({
    where: { id },
    data: {
      name: input?.name,
      shortName: input?.shortName,
      contactName: input?.contactName,
      contactPhone: input?.contactPhone,
      contactEmail: input?.contactEmail,
      address: input?.address,
      phone: input?.phone,
      taxId: input?.taxId,
      bankAccountName: input?.bankAccountName,
      bankName: input?.bankName,
      bankBranch: input?.bankBranch,
      bankCode: input?.bankCode,
      bankAccount: input?.bankAccount,
    },
  });
};

module.exports = {
  updateSupplier,
};
