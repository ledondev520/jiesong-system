#!/usr/bin/env node
/**
 * Input: stdio JSON-RPC / 环境变量 baseUrl+token
 * Output: 最小可用 MCP stdio server
 * Pos: 在 CLI 稳定后对外封装 MCP tools
 *
 * 说明：
 * - 当前实现为 stdio transport，适合本机/VPS sidecar 调用。
 * - 远程 HTTP MCP 暂未在本轮实现。
 */

const readline = require('node:readline');
const { JiesongApiClient } = require('../sdk/jiesongApiClient');

const LATEST_PROTOCOL_VERSION = '2025-06-18';
const SUPPORTED_PROTOCOL_VERSIONS = [LATEST_PROTOCOL_VERSION, '2024-11-05'];

const buildTools = () => ([
  {
    name: 'search_entities',
    description: 'Search products, suppliers, purchases, and sales from Jiesong.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        types: { type: 'array', items: { type: 'string' } },
        limit: { type: 'integer' },
      },
      required: ['query'],
    },
  },
  {
    name: 'create_purchase_with_items',
    description: 'Create one purchase contract with items in a single operation.',
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
    description: 'Create one supplier record.',
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
    description: 'Update one supplier record.',
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
    description: 'Update one purchase contract.',
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
]);

const createMcpServer = (client) => {
  const tools = buildTools();

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
          version: '0.1.0',
        },
      };
    },

    async listTools() {
      return { tools };
    },

    async callTool(params = {}) {
      const args = params.arguments || {};

      if (params.name === 'search_entities') {
        const result = await client.searchEntities(args);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result,
        };
      }

      if (params.name === 'create_purchase_with_items') {
        const result = await client.createPurchase(args);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result,
        };
      }

      if (params.name === 'create_supplier') {
        const result = await client.createSupplier(args);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result,
        };
      }

      if (params.name === 'update_supplier') {
        const { id, ...payload } = args;
        const result = await client.updateSupplier(id, payload);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result,
        };
      }

      if (params.name === 'update_purchase') {
        const { id, ...payload } = args;
        const result = await client.updatePurchase(id, payload);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result,
        };
      }

      throw new Error(`Unknown tool: ${params.name}`);
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
