/** Restricted supplier bank fields: only these roles may read or write them (AGENTS.md data classification). */
const BANK_FIELDS = ['bankAccountName', 'bankName', 'bankBranch', 'bankCode', 'bankAccount'];
const BANK_ROLES = ['ADMIN', 'FINANCE', 'PURCHASE', 'BOSS'];
const BANK_WRITE_ROLES = ['ADMIN', 'FINANCE', 'PURCHASE'];

const omitBankFields = (record) => {
  if (!record || typeof record !== 'object') return record;
  const copy = { ...record };
  BANK_FIELDS.forEach((field) => delete copy[field]);
  return copy;
};

/** Read side: callers without a bank role (SALES/WAREHOUSE) never see bank fields. */
const redactSupplierForRole = (role, record) => (BANK_ROLES.includes(role) ? record : omitBankFields(record));

/** Write side: bank fields from other roles/agents are dropped silently so existing values are never overwritten. */
const sanitizeSupplierInput = (role, input) => (BANK_WRITE_ROLES.includes(role) ? input : omitBankFields(input));

/** Strip bank fields from every nested `supplier` object (includes such as `supplier: true`) for roles without bank access. */
const redactNestedSuppliers = (role, data) => {
  if (BANK_ROLES.includes(role)) return data;
  const walk = (node) => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== 'object' || node instanceof Date) return node;
    const copy = {};
    Object.keys(node).forEach((key) => {
      copy[key] = key === 'supplier' && node[key] && typeof node[key] === 'object' ? omitBankFields(walk(node[key])) : walk(node[key]);
    });
    return copy;
  };
  return walk(data);
};

module.exports = { BANK_FIELDS, BANK_ROLES, redactSupplierForRole, redactNestedSuppliers, sanitizeSupplierInput };
