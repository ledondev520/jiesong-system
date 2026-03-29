#!/usr/bin/env node
/**
 * Input: CLI argv
 * Output: Agent-friendly CLI for search / ingest
 * Pos: 第一批 CLI 命令入口
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

const printCreated = (stdout, result, asJson, entityLabel) => {
  if (asJson) {
    return writeJson(stdout, result);
  }

  stdout.write(`${entityLabel} created: ${result.contractNo || result.name || result.id}\n`);
};

const runCli = async (argv, {
  client,
  stdout = process.stdout,
  stderr = process.stderr,
  readFile = fs.readFile,
} = {}) => {
  const { args, flags } = parseFlags(argv);
  const api = createClient(client);
  const asJson = flags.json === true;

  try {
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

    stderr.write('unknown command\n');
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
