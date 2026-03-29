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
const { createSupplier, updateSupplier } = require('../agent/commands/supplier');
const { createMcpServer } = require('../agent/mcp/server');

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

const createLocalClient = () => ({
  searchEntities,
  createPurchase: (input) => createPurchaseWithItems({ input }),
  updatePurchase: (id, input) => updatePurchase({ id, input }),
  createSupplier: (input) => createSupplier({ input }),
  updateSupplier: (id, input) => updateSupplier({ id, input }),
});

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
  const server = createMcpServer(createLocalClient());

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
