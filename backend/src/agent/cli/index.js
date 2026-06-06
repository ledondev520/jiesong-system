#!/usr/bin/env node
/**
 * Input: CLI argv
 * Output: Agent-friendly CLI for search / ingest / query
 * Pos: CLI 命令入口，覆盖查询、创建、更新全链路
 */

const fs = require('node:fs/promises');
const { JiesongApiClient, JiesongApiError } = require('../sdk/jiesongApiClient');

const writeJson = (stream, value) => {
  stream.write(`${JSON.stringify(value)}\n`);
};

const parseFlags = (argv) => {
  const args = [];
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      args.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    index += 1;
  }

  return { args, flags };
};

const createClient = (client) => {
  if (client) return client;
  return new JiesongApiClient({
    baseUrl: process.env.JIESONG_BASE_URL,
    token: process.env.JIESONG_AGENT_TOKEN,
  });
};

const printSearchResult = (stdout, result, asJson) => {
  if (asJson) {
    return writeJson(stdout, result);
  }

  stdout.write(`query: ${result.query}\n`);
  for (const item of result.items || []) {
    stdout.write(`- [${item.type}] ${item.title}${item.subtitle ? ` | ${item.subtitle}` : ''}\n`);
  }
};

const printPaginated = (stdout, result, asJson, label) => {
  if (asJson) {
    return writeJson(stdout, result);
  }
  const items = result.items || result.contracts || result.inventories || result.payments || [];
  stdout.write(`${label}: ${items.length} / ${result.total || items.length}\n`);
  for (const item of items.slice(0, 10)) {
    const title = item.contractNo || item.name || item.customsName || item.id || '—';
    stdout.write(`  - ${title}\n`);
  }
};

const printSingle = (stdout, result, asJson) => {
  if (asJson) {
    return writeJson(stdout, result);
  }
  stdout.write(`${JSON.stringify(result, null, 2)}\n`);
};

const printCreated = (stdout, result, asJson, entityLabel) => {
  if (asJson) {
    return writeJson(stdout, result);
  }

  stdout.write(`${entityLabel} created: ${result.contractNo || result.name || result.id}\n`);
};

const printAgentResponse = (stdout, result, asJson) => {
  if (asJson) {
    return writeJson(stdout, result);
  }
  stdout.write(`Agent: ${result.agentType || 'unified'}\n`);
  stdout.write(`Session: ${result.sessionId || '—'}\n`);
  stdout.write(`Tokens: ${result.tokenUsage?.total || '—'}\n`);
  stdout.write(`\n${result.message || result.content || ''}\n`);
};

const runCli = async (argv, {
  client,
  stdout = process.stdout,
  stderr = process.stderr,
  readFile = fs.readFile,
} = {}) => {
  const { args, flags } = parseFlags(argv);
  const asJson = flags.json === true;

  // help 不需要认证
  if (args[0] === 'help' || args[0] === '--help' || args[0] === '-h' || !args[0]) {
    stdout.write(`
捷淞国际物流 CLI (jiesong)

环境变量:
  JIESONG_BASE_URL    后端地址 (默认: http://localhost:3001)
  JIESONG_AGENT_TOKEN Agent 凭证 Token (JWT 或 Agent Credential)

命令:
  search <query>                    统一搜索
    --types product,supplier,purchase,sales
    --limit N

  sales list                        列出出口合同
    --status <STATUS>
    --store-id <ID>
    --keyword <KEYWORD>
    --page N  --page-size N

  sales get --id <ID>               查看单条出口合同

  inventory list                    列出库存
    --status <STATUS>
    --product-id <ID>
    --keyword <KEYWORD>
    --page N  --page-size N

  finance payments                  列出收付款记录
    --type INCOME|EXPENSE
    --page N  --page-size N

  finance payables                  列出应付账款
    --page N  --page-size N

  finance receivables               列出应收账款
    --overdue-days N
    --page N  --page-size N

  customs list                      列出报关单
    --sales-contract-id <ID>
    --page N  --page-size N

  dashboard                         获取经营看板数据

  agent "<message>"                 调用 AI Agent
    --agent-type unified|finance|export|executive
    --session-id <ID>

  agent tools                       列出 Agent 可用工具

  purchase create --file <path>     创建采购合同 (JSON)
  purchase update --id <ID> --file <path>

  supplier create                   创建供应商
    --name <NAME>
    --short-name <NAME>
    --contact-name <NAME>
    --phone <PHONE>

  supplier update --id <ID> --file <path>

全局选项:
  --json                            输出 JSON 格式
`);
    return 0;
  }

  const api = createClient(client);

  try {
    // ── search ──
    if (args[0] === 'search') {
      const query = args[1];
      const result = await api.searchEntities({
        query,
        types: typeof flags.types === 'string' ? flags.types.split(',').map((item) => item.trim()).filter(Boolean) : undefined,
        limit: flags.limit ? Number.parseInt(String(flags.limit), 10) : undefined,
      });
      printSearchResult(stdout, result, asJson);
      return 0;
    }

    // ── sales ──
    if (args[0] === 'sales' && args[1] === 'list') {
      const result = await api.listSalesContracts({
        status: flags.status,
        storeId: flags['store-id'],
        keyword: flags.keyword,
        page: flags.page ? Number.parseInt(String(flags.page), 10) : 1,
        pageSize: flags['page-size'] ? Number.parseInt(String(flags['page-size']), 10) : 20,
      });
      printPaginated(stdout, result, asJson, 'sales contracts');
      return 0;
    }

    if (args[0] === 'sales' && args[1] === 'get') {
      const id = flags.id;
      if (!id) {
        stderr.write('missing --id\n');
        return 2;
      }
      const result = await api.getSalesContractById(id);
      printSingle(stdout, result, asJson);
      return 0;
    }

    // ── inventory ──
    if (args[0] === 'inventory' && args[1] === 'list') {
      const result = await api.listInventories({
        status: flags.status,
        productId: flags['product-id'],
        keyword: flags.keyword,
        page: flags.page ? Number.parseInt(String(flags.page), 10) : 1,
        pageSize: flags['page-size'] ? Number.parseInt(String(flags['page-size']), 10) : 20,
      });
      printPaginated(stdout, result, asJson, 'inventories');
      return 0;
    }

    // ── finance ──
    if (args[0] === 'finance' && args[1] === 'payments') {
      const result = await api.listPayments({
        type: flags.type,
        page: flags.page ? Number.parseInt(String(flags.page), 10) : 1,
        pageSize: flags['page-size'] ? Number.parseInt(String(flags['page-size']), 10) : 20,
      });
      printPaginated(stdout, result, asJson, 'payments');
      return 0;
    }

    if (args[0] === 'finance' && args[1] === 'payables') {
      const result = await api.getPayables({
        page: flags.page ? Number.parseInt(String(flags.page), 10) : 1,
        pageSize: flags['page-size'] ? Number.parseInt(String(flags['page-size']), 10) : 20,
      });
      printPaginated(stdout, result, asJson, 'payables');
      return 0;
    }

    if (args[0] === 'finance' && args[1] === 'receivables') {
      const result = await api.getReceivables({
        page: flags.page ? Number.parseInt(String(flags.page), 10) : 1,
        pageSize: flags['page-size'] ? Number.parseInt(String(flags['page-size']), 10) : 20,
        overdueDays: flags['overdue-days'] ? Number.parseInt(String(flags['overdue-days']), 10) : undefined,
      });
      printPaginated(stdout, result, asJson, 'receivables');
      return 0;
    }

    // ── customs ──
    if (args[0] === 'customs' && args[1] === 'list') {
      const result = await api.listCustomsDeclarations({
        salesContractId: flags['sales-contract-id'],
        page: flags.page ? Number.parseInt(String(flags.page), 10) : 1,
        pageSize: flags['page-size'] ? Number.parseInt(String(flags['page-size']), 10) : 20,
      });
      printPaginated(stdout, result, asJson, 'customs declarations');
      return 0;
    }

    // ── dashboard ──
    if (args[0] === 'dashboard') {
      const result = await api.getDashboardAnalytics();
      printSingle(stdout, result, asJson);
      return 0;
    }

    // ── agent ──
    if (args[0] === 'agent') {
      const message = flags.message || args.slice(1).join(' ');
      if (!message) {
        stderr.write('missing message\n');
        return 2;
      }
      const result = await api.agentPrompt({
        message,
        agentType: flags['agent-type'] || 'unified',
        sessionId: flags['session-id'],
      });
      printAgentResponse(stdout, result, asJson);
      return 0;
    }

    if (args[0] === 'agent' && args[1] === 'tools') {
      const result = await api.getAgentTools();
      printSingle(stdout, result, asJson);
      return 0;
    }

    // ── purchase ──
    if (args[0] === 'purchase' && args[1] === 'create') {
      const filePath = flags.file;
      if (!filePath) {
        stderr.write('missing --file\n');
        return 2;
      }
      const raw = await readFile(filePath, 'utf8');
      const payload = JSON.parse(raw);
      const result = await api.createPurchase(payload);
      printCreated(stdout, result, asJson, 'purchase');
      return 0;
    }

    if (args[0] === 'purchase' && args[1] === 'update') {
      const id = flags.id;
      const filePath = flags.file;
      if (!id || !filePath) {
        stderr.write('missing --id or --file\n');
        return 2;
      }
      const payload = JSON.parse(await readFile(filePath, 'utf8'));
      const result = await api.updatePurchase(id, payload);
      printCreated(stdout, result, asJson, 'purchase');
      return 0;
    }

    // ── supplier ──
    if (args[0] === 'supplier' && args[1] === 'create') {
      const payload = {
        name: flags.name,
        shortName: flags['short-name'],
        contactName: flags['contact-name'],
        contactPhone: flags.phone,
      };
      const result = await api.createSupplier(payload);
      printCreated(stdout, result, asJson, 'supplier');
      return 0;
    }

    if (args[0] === 'supplier' && args[1] === 'update') {
      const id = flags.id;
      const filePath = flags.file;
      if (!id || !filePath) {
        stderr.write('missing --id or --file\n');
        return 2;
      }
      const payload = JSON.parse(await readFile(filePath, 'utf8'));
      const result = await api.updateSupplier(id, payload);
      printCreated(stdout, result, asJson, 'supplier');
      return 0;
    }

    stderr.write(`unknown command: ${args.join(' ')}\nRun 'jiesong help' for usage.\n`);
    return 2;
  } catch (error) {
    if (error instanceof JiesongApiError) {
      if (asJson) {
        writeJson(stderr, {
          error: error.message,
          status: error.status,
          code: error.code,
          data: error.data,
        });
      } else {
        stderr.write(`${error.message}\n`);
      }

      if (error.status === 401) return 4;
      if (error.status === 403) return 5;
      if (error.status === 400) return 6;
      return 7;
    }

    stderr.write(`${error.message}\n`);
    return 7;
  }
};

if (require.main === module) {
  runCli(process.argv.slice(2)).then((exitCode) => {
    process.exit(exitCode);
  });
}

module.exports = {
  runCli,
};
