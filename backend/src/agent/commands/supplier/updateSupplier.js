/** Updates the live supplier editor without clearing omitted optional fields or aliases. */
const prisma = require("../../../utils/prisma");
const { createError } = require("../../../middleware/errorHandler");
const { normalizeSupplierAliases } = require("./aliases");

// Archive (isActive=false) is ADMIN/PURCHASE; restore (true) is ADMIN. Other fields stay open to all business roles.
// Callers without a user role (agents) are denied, matching the pre-existing restore rule.
const assertActiveChangeAllowed = (role, isActive) => {
  if (typeof isActive !== "boolean") return;
  if (isActive === true && role !== "ADMIN") throw createError("仅管理员可恢复已归档供应商", 403);
  if (isActive === false && !["ADMIN", "PURCHASE"].includes(role)) throw createError("仅管理员或采购可归档供应商", 403);
};

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
        isActive: typeof input?.isActive === "boolean" ? input.isActive : undefined,
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
  assertActiveChangeAllowed,
};
