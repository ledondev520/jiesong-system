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

module.exports = { BANK_FIELDS, redactSupplierForRole, sanitizeSupplierInput };
