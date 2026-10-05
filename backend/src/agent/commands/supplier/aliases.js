/** Supplier editor aliases: omission preserves them; explicit arrays replace them atomically. */
const { createError } = require("../../../middleware/errorHandler");

function normalizeSupplierAliases(aliases) {
  if (aliases === undefined) return undefined;
  if (!Array.isArray(aliases)) throw createError("供应商别名格式不正确", 400);
  return aliases.map((entry) => {
    if (typeof entry?.alias !== "string" || !entry.alias.trim()) {
      throw createError("供应商别名不能为空", 400);
    }
    return { alias: entry.alias.trim() };
  });
}

module.exports = { normalizeSupplierAliases };
