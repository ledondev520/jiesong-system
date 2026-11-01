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
const { createSupplier, updateSupplier, assertActiveChangeAllowed } = require('../agent/commands/supplier');
const { createMcpServer } = require('../agent/mcp/server');
const prisma = require('../utils/prisma');
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
    searchEntities,
    createPurchase: audited('PurchaseContract', 'CREATE', (input) => createPurchaseWithItems({ input })),
    updatePurchase: audited('PurchaseContract', 'UPDATE', (id, input) => updatePurchase({ id, input }), (id) => prisma.purchaseContract.findUnique({ where: { id } })),
    createSupplier: audited('Supplier', 'CREATE', (input) => createSupplier({ input })),
    updateSupplier: audited('Supplier', 'UPDATE', (id, input) => {
      assertActiveChangeAllowed(actorRole, input?.isActive);
      return updateSupplier({ id, input });
    }, (id) => prisma.supplier.findUnique({ where: { id } })),
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
      error: { code: -32000, message: error.message },
    });
  }
});

module.exports = router;
module.exports.TOOL_POLICIES = TOOL_POLICIES;
