/**
 * Input: Prisma客户端、请求对象
 * Output: 操作日志记录
 * Pos: 审计日志工具，记录用户操作
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('./prisma');

const SENSITIVE_FIELDS = new Set(['password', 'token', 'secret', 'apikey']);
const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /token/i,
  /secret/i,
  /api[-_]?key/i,
  /credential/i,
];

const CRITICAL_FIELDS_BY_ENTITY = {
  User: ['username', 'name', 'role', 'email', 'phone', 'isActive', 'avatar'],
  Store: ['name', 'portId', 'contactName', 'contactPhone', 'contactEmail', 'address', 'isActive'],
  Supplier: ['name', 'shortName', 'contactName', 'contactPhone', 'contactEmail', 'address', 'phone', 'taxId', 'bankName', 'bankAccount', 'isActive', 'hasQualityIssue', 'qualityNote'],
  Product: ['customsName', 'description', 'specification', 'unit', 'categoryId', 'grossWeight', 'netWeight', 'volume', 'packingSpec', 'length', 'width', 'height', 'isActive'],
  ProductCategory: ['name', 'parentId'],
  Port: ['name', 'code', 'isActive'],
  SalesContract: ['status', 'exchangeRate', 'signedAt', 'estimatedArrival', 'portId', 'note', 'totalAmount', 'totalBoxes', 'grossWeight', 'netWeight', 'volume', 'customsBroker', 'isFumigated', 'hasTaxRefund', 'shippedAt'],
  PurchaseContract: ['status', 'supplierId', 'taxRate', 'signedAt', 'expectedDate', 'invoiceNo', 'note', 'totalAmount', 'paidAmount'],
  PurchaseItem: ['productId', 'quantity', 'unit', 'unitPrice', 'totalPrice', 'specification', 'note'],
  ContractFile: ['fileName', 'filePath', 'fileType', 'fileSize'],
  PriceHistory: ['productId', 'price', 'supplierId', 'unitPrice'],
  Payment: ['type', 'amount', 'currency', 'paymentMethod', 'paymentDate', 'note', 'purchaseContractId', 'salesContractId'],
  SupplierAlias: ['alias', 'supplierId'],
  Inventory: ['status', 'quantity', 'salesContractId', 'inboundAt', 'outboundAt'],
  PackingItem: ['salesContractId', 'productId', 'storeId', 'quantity', 'unit', 'boxes', 'grossWeight', 'netWeight', 'volume', 'unitPrice', 'totalPrice', 'note'],
  SalesItem: ['salesContractId', 'productId', 'storeId', 'quantity', 'unit', 'costPrice', 'sellingPrice', 'specification', 'note'],
  ChatSession: ['sessionId', 'userId'],
  SystemConfig: ['key', 'value', 'note'],
  ContractTemplate: ['exists'],
  DataImport: ['created', 'failed', 'success'],
  ImportRecord: ['fileName', 'totalRows', 'successRows', 'failedRows', 'status'],
};

const normalizeEntity = (entity = '') => {
  const trimmed = String(entity).trim();
  const map = {
    Container: 'SalesContract',
    ContainerItem: 'PackingItem',
    Import: 'DataImport',
  };

  return map[trimmed] || trimmed;
};

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const isSensitiveField = (key) => {
  const normalized = String(key || '').trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (SENSITIVE_FIELDS.has(normalized)) {
    return true;
  }

  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(normalized));
};

const isSensitiveConfigRecord = (value) => {
  if (!isObject(value) || typeof value.key !== 'string') {
    return false;
  }

  return isSensitiveField(value.key);
};

const sanitizeValue = (value) => {
  if (value === null || value === undefined) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (!isObject(value)) {
    return value;
  }

  const sanitized = {};
  const sensitiveConfigRecord = isSensitiveConfigRecord(value);

  Object.entries(value).forEach(([key, itemValue]) => {
    if (isSensitiveField(key)) {
      return;
    }

    if (sensitiveConfigRecord && key === 'value') {
      return;
    }
    sanitized[key] = sanitizeValue(itemValue);
  });

  return sanitized;
};

const toComparable = (value) => {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  return value;
};

const buildCriticalComparison = (entity, oldValue = null, newValue = null) => {
  const normalizedEntity = normalizeEntity(entity);
  const criticalKeys = CRITICAL_FIELDS_BY_ENTITY[normalizedEntity] || [];
  const oldRecord = sanitizeValue(oldValue);
  const newRecord = sanitizeValue(newValue);

  if (!criticalKeys.length || !isObject(oldRecord) || !isObject(newRecord)) {
    return {
      hasChange: false,
      before: null,
      after: null,
      keys: criticalKeys,
    };
  }

  const before = {};
  const after = {};
  let hasChange = false;

  criticalKeys.forEach((key) => {
    const oldKeyValue = oldRecord[key];
    const newKeyValue = newRecord[key];

    if (JSON.stringify(toComparable(oldKeyValue)) === JSON.stringify(toComparable(newKeyValue))) {
      return;
    }

    before[key] = sanitizeValue(oldKeyValue);
    after[key] = sanitizeValue(newKeyValue);
    hasChange = true;
  });

  return {
    hasChange,
    before: hasChange ? before : null,
    after: hasChange ? after : null,
    keys: criticalKeys,
  };
};

const resolveValues = (action, entity, oldValue, newValue) => {
  const oldSanitized = sanitizeValue(oldValue);
  const newSanitized = sanitizeValue(newValue);

  if (action === 'UPDATE') {
    const comparison = buildCriticalComparison(entity, oldSanitized, newSanitized);
    if (comparison.hasChange) {
      return { oldValue: comparison.before, newValue: comparison.after };
    }

    // 若实体存在关键字段清单但本次未变更关键字段，补齐完整快照，便于排查
    if (comparison.keys.length > 0) {
      return { oldValue: oldSanitized, newValue: newSanitized };
    }
  }

  return { oldValue: oldSanitized, newValue: newSanitized };
};

const stringifyLogValue = (value) => {
  try {
    return value ? JSON.stringify(value) : null;
  } catch {
    return null;
  }
};

/**
 * 职责：记录操作日志
 * @param {Object} params - 日志参数
 * @param {string} params.actorType - Actor 类型（USER / AGENT）
 * @param {string} params.userId - 用户ID
 * @param {string} params.agentAccountId - Agent 账号ID
 * @param {string} params.agentCredentialId - Agent 凭证ID
 * @param {string} params.action - 操作类型 (CREATE/UPDATE/DELETE/LOGIN等)
 * @param {string} params.entity - 操作实体 (User/Supplier/Product等)
 * @param {string} params.entityId - 实体ID
 * @param {Object} params.oldValue - 修改前的值
 * @param {Object} params.newValue - 修改后的值
 * @param {Object} params.req - Express请求对象
 */
const logOperation = async ({
  actorType = null,
  userId,
  agentAccountId = null,
  agentCredentialId = null,
  action,
  entity,
  entityId = null,
  oldValue = null,
  newValue = null,
  req = null,
}) => {
  try {
    const resolvedValues = resolveValues(action, entity, oldValue, newValue);
    const resolvedActorType = String(actorType || (agentAccountId ? 'AGENT' : 'USER')).toUpperCase();

    await prisma.operationLog.create({
      data: {
        actorType: resolvedActorType,
        userId: resolvedActorType === 'USER' ? userId || null : null,
        agentAccountId: resolvedActorType === 'AGENT' ? agentAccountId || null : null,
        agentCredentialId: resolvedActorType === 'AGENT' ? agentCredentialId || null : null,
        action,
        entity,
        entityId,
        requestId: req?.headers?.['x-request-id'] || null,
        idempotencyKey: req?.headers?.['x-idempotency-key'] || null,
        oldValue: stringifyLogValue(resolvedValues.oldValue),
        newValue: stringifyLogValue(resolvedValues.newValue),
        ipAddress: req?.ip || req?.connection?.remoteAddress || null,
        userAgent: req?.headers?.['user-agent'] || null,
      },
    });
  } catch (error) {
    // 日志记录失败不应影响主业务
    console.error('操作日志记录失败:', error.message);
  }
};

/**
 * 职责：创建审计日志中间件
 * 思路：包装controller方法，自动记录操作
 * @param {string} entity - 实体名称
 * @param {string} action - 操作类型
 * @returns {Function} 中间件函数
 */
const auditMiddleware = (entity, action) => {
  return (originalHandler) => {
    return async (req, res, next) => {
      // 保存原始的res.json方法
      const originalJson = res.json.bind(res);
      
      // 重写res.json以便捕获响应
      res.json = async (data) => {
        // 只在成功操作时记录日志
        if (data.code >= 200 && data.code < 300 && req.user) {
          await logOperation({
            actorType: 'USER',
            userId: req.user.id,
            action,
            entity,
            entityId: req.params?.id || data.data?.id,
            newValue: ['CREATE', 'UPDATE'].includes(action) ? data.data : null,
            req,
          });
        }
        return originalJson(data);
      };
      
      // 调用原始处理器
      return originalHandler(req, res, next);
    };
  };
};

/**
 * 职责：快捷日志记录方法
 */
const log = {
  create: (userId, entity, entityId, newValue, req) => 
    logOperation({ actorType: 'USER', userId, action: 'CREATE', entity, entityId, newValue, req }),
  
  update: (userId, entity, entityId, oldValue, newValue, req) =>
    logOperation({ actorType: 'USER', userId, action: 'UPDATE', entity, entityId, oldValue, newValue, req }),
  
  delete: (userId, entity, entityId, oldValue, req) =>
    logOperation({ actorType: 'USER', userId, action: 'DELETE', entity, entityId, oldValue, req }),
  
  login: (userId, req) =>
    logOperation({ actorType: 'USER', userId, action: 'LOGIN', entity: 'User', entityId: userId, req }),
  
  logout: (userId, req) =>
    logOperation({ actorType: 'USER', userId, action: 'LOGOUT', entity: 'User', entityId: userId, req }),

  action: (userId, action, entity, entityId = null, oldValue = null, newValue = null, req = null) =>
    logOperation({ actorType: 'USER', userId, action, entity, entityId, oldValue, newValue, req }),
};

module.exports = {
  logOperation,
  auditMiddleware,
  log,
};
