/** Updates the live supplier editor without clearing omitted optional fields or aliases. */
const prisma = require("../../../utils/prisma");
const { createError } = require("../../../middleware/errorHandler");
const { normalizeSupplierAliases } = require("./aliases");

const updateSupplier = async ({ id, input, prismaClient = prisma } = {}) => {
  const aliases = normalizeSupplierAliases(input?.aliases);
  try {
    return await prismaClient.supplier.update({
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
        hasQualityIssue: input?.hasQualityIssue,
        qualityNote: input?.qualityNote,
        // One nested write preserves the supplier and old aliases if replacement fails.
        aliases:
          aliases === undefined
            ? undefined
            : { deleteMany: {}, create: aliases },
      },
      include: { aliases: true },
    });
  } catch (error) {
    if (error.code === "P2002") throw createError("供应商别名已存在", 409);
    throw error;
  }
};

module.exports = {
  updateSupplier,
};
