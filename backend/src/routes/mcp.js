/**
 * Input: MCP tool server、认证上下文
 * Output: 远程 HTTP MCP 入口
 * Pos: VPS 部署后供内部 Agent 远程调用的 MCP endpoint
 */

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { hasCapabilities, parseCapability } = require('../middleware/roleAuth');
const { searchEntities } = require('../agent/commands/query');
const { createPurchaseWithItems, updatePurchase } = require('../agent/commands/purchase');
const {
  createSupplier, updateSupplier, assertActiveChangeAllowed, sanitizeSupplierInput,
} = require('../agent/commands/supplier');
const { redactNestedSuppliers, redactSupplierForRole } = require('../agent/commands/supplier/bankFields');
const { createMcpServer } = require('../agent/mcp/server');
const prisma = require('../utils/prisma');
const { redactWarehouseMoney } = require('../utils/warehouseRedaction');
const { keepStoredPrices } = require('../utils/warehousePurchasePrices');
const { logOperation } = require('../utils/auditLog');

const router = Router();

const TOOL_POLICIES = {
  search_entities: {
    capabilities: ['search.read'],
    roles: ['ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'],
  },
  create_purchase_with_items: {
    capabilities: ['purchase.create'],
    roles: ['ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'],
  },
  update_purchase: {
    capabilities: ['purchase.update'],
    roles: ['ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'],
  },
  create_supplier: {
    capabilities: ['supplier.create'],
    roles: ['ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'],
  },
  update_supplier: {
    capabilities: ['supplier.update'],
    roles: ['ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'],
  },
};

// Writes are attributed to the authenticated actor in operation_logs (commands themselves take no actor).
const actorOf = (req) => (req.authActor?.actorType === 'AGENT'
  ? { actorType: 'AGENT', agentAccountId: req.authActor.agentAccountId || req.agent?.id || null, agentCredentialId: req.authActor.agentCredentialId || req.agentCredential?.id || null }
  : { actorType: 'USER', userId: req.user?.id || null });

const createLocalClient = (req) => {
  // loadBefore (updates only) captures oldValue so MCP audit rows carry the same diff as REST withAuditLog.
  const audited = (entity, action, run, loadBefore) => async (...args) => {
    const oldValue = loadBefore ? await loadBefore(...args) : null;
    const result = await run(...args);
    await logOperation({ ...actorOf(req), action, entity, entityId: result?.id || null, oldValue, newValue: result, req });
    return result;
  };
  const actorRole = req.authActor?.actorType === 'AGENT' ? null : req.user?.role;
  return {
    // OD-3：WAREHOUSE 的搜索副标题不带合同金额；采购读写结果同样剥离金额与发票号（与 REST 一致）
    searchEntities: (args) => searchEntities({ ...args, includeAmounts: actorRole !== 'WAREHOUSE' }),
    // 审计记录完整结果；返回给调用方的副本再按角色剔除银行字段与（WAREHOUSE）金额/发票号
    createPurchase: async (input) => redactWarehouseMoney(actorRole, redactNestedSuppliers(actorRole,
      await audited('PurchaseContract', 'CREATE', (i) => createPurchaseWithItems({ input: i }))(input))),
    updatePurchase: async (id, input) => redactWarehouseMoney(actorRole, redactNestedSuppliers(actorRole,
      await audited('PurchaseContract', 'UPDATE', async (pid, i) => updatePurchase({ id: pid, input: await keepStoredPrices(actorRole, pid, i) }), (pid) => prisma.purchaseContract.findUnique({ where: { id: pid } }))(id, input))),
    createSupplier: async (input) => redactSupplierForRole(actorRole, await audited('Supplier', 'CREATE', (i) => createSupplier({ input: sanitizeSupplierInput(actorRole, i) }))(input)),
    updateSupplier: async (id, input) => redactSupplierForRole(actorRole, await audited('Supplier', 'UPDATE', (sid, i) => {
      assertActiveChangeAllowed(actorRole, i?.isActive);
      return updateSupplier({ id: sid, input: sanitizeSupplierInput(actorRole, i) });
    }, (sid) => prisma.supplier.findUnique({ where: { id: sid } }))(id, input)),
  };
};

const canInvokeTool = (req, toolName) => {
  const policy = TOOL_POLICIES[toolName];
  if (!policy) return false;

  if (req.authActor?.actorType === 'AGENT') {
    const required = policy.capabilities.map(parseCapability).filter(Boolean);
    return hasCapabilities(req.agent, required);
  }

  if (req.user?.role) {
    return policy.roles.includes(req.user.role);
  }

  return false;
};

router.get('/', authenticate, (req, res) => {
  res.status(405).json({
    code: 405,
    message: 'HTTP MCP 当前仅支持 POST JSON-RPC',
  });
});

router.post('/', authenticate, async (req, res) => {
  const server = createMcpServer(createLocalClient(req));

  if (req.body?.method === 'tools/call') {
    const toolName = req.body?.params?.name;
    if (!canInvokeTool(req, toolName)) {
      return res.status(403).json({
        jsonrpc: '2.0',
        id: req.body?.id ?? null,
        error: { code: -32001, message: 'Tool access denied' },
      });
    }
  }

  try {
    const response = await server.handleMessage(req.body);
    if (!response) {
      return res.status(202).end();
    }
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({
      jsonrpc: '2.0',
      id: req.body?.id ?? null,
      // Raw messages can carry Prisma/FS details; only expose them outside production.
      error: { code: -32000, message: process.env.NODE_ENV === 'production' ? 'Internal error' : error.message },
    });
  }
});

module.exports = router;
module.exports.TOOL_POLICIES = TOOL_POLICIES;
