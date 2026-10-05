/** Persists the live supplier editor, including optional quality fields and aliases. */
const prisma = require("../../../utils/prisma");
const { createError } = require("../../../middleware/errorHandler");
const { normalizeSupplierAliases } = require("./aliases");

const createSupplier = async ({ input, prismaClient = prisma } = {}) => {
  const data = input || {};
  const name = String(data.name || "").trim();
  if (!name) {
    throw createError("供应商名称不能为空", 400);
  }

  const aliases = normalizeSupplierAliases(data.aliases);
  try {
    return await prismaClient.supplier.create({
      data: {
        name,
        shortName: data.shortName || null,
        contactName: data.contactName || null,
        contactPhone: data.contactPhone || null,
        contactEmail: data.contactEmail || null,
        address: data.address || null,
        phone: data.phone || null,
        taxId: data.taxId || null,
        bankAccountName: data.bankAccountName || null,
        bankName: data.bankName || null,
        bankBranch: data.bankBranch || null,
        bankCode: data.bankCode || null,
        bankAccount: data.bankAccount || null,
        hasQualityIssue: data.hasQualityIssue,
        qualityNote: data.qualityNote || null,
        aliases: aliases === undefined ? undefined : { create: aliases },
      },
      include: { aliases: true },
    });
  } catch (error) {
    if (error.code === "P2002") throw createError("供应商别名已存在", 409);
    throw error;
  }
};

module.exports = {
  createSupplier,
};
