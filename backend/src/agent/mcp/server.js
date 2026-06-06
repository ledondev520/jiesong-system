#!/usr/bin/env node
/**
 * Input: stdio JSON-RPC / 环境变量 baseUrl+token
 * Output: MCP stdio server，暴露捷淞国际物流全量查询与操作能力
 * Pos: Agent 通过 MCP 协议接入系统
 */

const readline = require('node:readline');
const { JiesongApiClient } = require('../sdk/jiesongApiClient');

const LATEST_PROTOCOL_VERSION = '2025-06-18';
const SUPPORTED_PROTOCOL_VERSIONS = [LATEST_PROTOCOL_VERSION, '2024-11-05'];

const buildTools = () => ([
  {
    name: 'search_entities',
    description: '统一搜索：产品、供应商、采购合同、出口合同',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        types: { type: 'array', items: { type: 'string', enum: ['product', 'supplier', 'purchase', 'sales'] } },
        limit: { type: 'integer', default: 10 },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_sales_contracts',
    description: '列出出口合同，支持状态、门店、关键词筛选',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: '合同状态: DRAFT, CONFIRMED, PACKING, SHIPPED, ARRIVED, COMPLETED' },
        storeId: { type: 'string' },
        keyword: { type: 'string' },
        page: { type: 'integer', default: 1 },
        pageSize: { type: 'integer', default: 20 },
      },
    },
  },
  {
    name: 'get_sales_contract',
    description: '查看单条出口合同详情',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '合同 ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_inventories',
    description: '列出库存记录，支持状态、产品筛选',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: '库存状态: PRODUCING, PACKING, SHIPPING, INBOUND, OUTBOUND' },
        productId: { type: 'string' },
        keyword: { type: 'string' },
        page: { type: 'integer', default: 1 },
        pageSize: { type: 'integer', default: 20 },
      },
    },
  },
  {
    name: 'list_payments',
    description: '列出收付款记录',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['INCOME', 'EXPENSE'], description: '收入或支出' },
        page: { type: 'integer', default: 1 },
        pageSize: { type: 'integer', default: 20 },
      },
    },
  },
  {
    name: 'get_payables',
    description: '列出应付账款',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'integer', default: 1 },
        pageSize: { type: 'integer', default: 20 },
      },
    },
  },
  {
    name: 'get_receivables',
    description: '列出应收账款（含逾期）',
    inputSchema: {
      type: 'object',
      properties: {
        overdueDays: { type: 'integer', description: '逾期天数阈值' },
        page: { type: 'integer', default: 1 },
        pageSize: { type: 'integer', default: 20 },
      },
    },
  },
  {
    name: 'list_customs_declarations',
    description: '列出报关单',
    inputSchema: {
      type: 'object',
      properties: {
        salesContractId: { type: 'string', description: '关联的出口合同 ID' },
        page: { type: 'integer', default: 1 },
        pageSize: { type: 'integer', default: 20 },
      },
    },
  },
  {
    name: 'get_dashboard_analytics',
    description: '获取经营看板数据（合同统计、应收、库存、出货趋势）',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'create_purchase_with_items',
    description: '创建采购合同（含明细）',
    inputSchema: {
      type: 'object',
      properties: {
        supplierId: { type: 'string' },
        taxRate: { type: 'integer' },
        note: { type: 'string' },
        items: { type: 'array', items: { type: 'object' } },
      },
      required: ['supplierId', 'items'],
    },
  },
  {
    name: 'create_supplier',
    description: '创建供应商',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        shortName: { type: 'string' },
        contactName: { type: 'string' },
        contactPhone: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_supplier',
    description: '更新供应商',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        shortName: { type: 'string' },
        contactName: { type: 'string' },
        contactPhone: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'update_purchase',
    description: '更新采购合同',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        taxRate: { type: 'integer' },
        note: { type: 'string' },
        invoiceNo: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'run_agent',
    description: '调用 AI Agent 进行自然语言查询或分析',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: '用户问题或指令' },
        agentType: { type: 'string', enum: ['unified', 'finance', 'export', 'executive'], default: 'unified' },
        sessionId: { type: 'string' },
      },
      required: ['message'],
    },
  },
]);

const createMcpServer = (client) => {
  const allTools = buildTools();

  const toolToMethod = {
    'search_entities': 'searchEntities',
    'list_sales_contracts': 'listSalesContracts',
    'get_sales_contract': 'getSalesContractById',
    'list_inventories': 'listInventories',
    'list_payments': 'listPayments',
    'get_payables': 'getPayables',
    'get_receivables': 'getReceivables',
    'list_customs_declarations': 'listCustomsDeclarations',
    'get_dashboard_analytics': 'getDashboardAnalytics',
    'create_purchase_with_items': 'createPurchase',
    'create_supplier': 'createSupplier',
    'update_supplier': 'updateSupplier',
    'update_purchase': 'updatePurchase',
    'run_agent': 'agentPrompt',
  };

  const tools = allTools.filter(t => typeof client[toolToMethod[t.name]] === 'function');

  const handlers = {
    async initialize(params = {}) {
      const version = SUPPORTED_PROTOCOL_VERSIONS.includes(params.protocolVersion)
        ? params.protocolVersion
        : LATEST_PROTOCOL_VERSION;

      return {
        protocolVersion: version,
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'jiesong-mcp',
          version: '0.2.0',
        },
      };
    },

    async listTools() {
      return { tools };
    },

    async callTool(params = {}) {
      const args = params.arguments || {};

      const callAndReturn = async (promise) => {
        const result = await promise;
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      };

      switch (params.name) {
        case 'search_entities':
          return callAndReturn(client.searchEntities(args));
        case 'list_sales_contracts':
          return callAndReturn(client.listSalesContracts(args));
        case 'get_sales_contract':
          return callAndReturn(client.getSalesContractById(args.id));
        case 'list_inventories':
          return callAndReturn(client.listInventories(args));
        case 'list_payments':
          return callAndReturn(client.listPayments(args));
        case 'get_payables':
          return callAndReturn(client.getPayables(args));
        case 'get_receivables':
          return callAndReturn(client.getReceivables(args));
        case 'list_customs_declarations':
          return callAndReturn(client.listCustomsDeclarations(args));
        case 'get_dashboard_analytics':
          return callAndReturn(client.getDashboardAnalytics());
        case 'create_purchase_with_items':
          return callAndReturn(client.createPurchase(args));
        case 'create_supplier':
          return callAndReturn(client.createSupplier(args));
        case 'update_supplier': {
          const { id, ...payload } = args;
          return callAndReturn(client.updateSupplier(id, payload));
        }
        case 'update_purchase': {
          const { id, ...payload } = args;
          return callAndReturn(client.updatePurchase(id, payload));
        }
        case 'run_agent':
          return callAndReturn(client.agentPrompt(args));
        default:
          throw new Error(`Unknown tool: ${params.name}`);
      }
    },
  };

  return {
    async handleMessage(message) {
      if (message.method === 'initialize') {
        return { jsonrpc: '2.0', id: message.id, result: await handlers.initialize(message.params) };
      }
      if (message.method === 'tools/list') {
        return { jsonrpc: '2.0', id: message.id, result: await handlers.listTools() };
      }
      if (message.method === 'tools/call') {
        return { jsonrpc: '2.0', id: message.id, result: await handlers.callTool(message.params) };
      }
      if (message.method === 'notifications/initialized') {
        return null;
      }

      return {
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32601, message: `Method not found: ${message.method}` },
      };
    },
  };
};

const createClientFromEnv = () => new JiesongApiClient({
  baseUrl: process.env.JIESONG_BASE_URL,
  token: process.env.JIESONG_AGENT_TOKEN,
});

const runStdioServer = async () => {
  const server = createMcpServer(createClientFromEnv());
  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let message;
    try {
      message = JSON.parse(trimmed);
    } catch (error) {
      process.stdout.write(`${JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      })}\n`);
      continue;
    }

    try {
      const response = await server.handleMessage(message);
      if (response) {
        process.stdout.write(`${JSON.stringify(response)}\n`);
      }
    } catch (error) {
      process.stdout.write(`${JSON.stringify({
        jsonrpc: '2.0',
        id: message.id ?? null,
        error: { code: -32000, message: error.message },
      })}\n`);
    }
  }
};

if (require.main === module) {
  runStdioServer().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  createMcpServer,
  runStdioServer,
};
