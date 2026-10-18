const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const acorn = require('../backend/node_modules/acorn');

const ROOT = path.resolve(__dirname, '..');
const BASE = '56426be209e270024008b761dbd835a54a6c4c47';
const REGISTRY = 'lifecycle/resources.json';
const TEMPLATE = 'lifecycle/resource.template.json';
const MATRIX = 'backend/src/integration/resource-lifecycle.integration.js';
const LIST_MATRIX = 'frontend/src/lib/hooks/list-lifecycle.test.tsx';

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  }
}
function parse(source) {
  return acorn.parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    locations: true,
  });
}
function memberName(node) {
  if (node?.type !== 'MemberExpression') return undefined;
  return node.computed ? node.property.value : node.property.name;
}
function literal(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string')
    return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0)
    return node.quasis[0].value.cooked;
  return undefined;
}
function routeBase(node) {
  if (node?.type !== 'CallExpression') return undefined;
  if (memberName(node.callee) === 'route') return node.arguments[0];
  return routeBase(node.callee?.object);
}
function scanSource(source, file) {
  const routes = [];
  const ast = parse(source);
  const routers = new Set();
  walk(ast, (node) => {
    if (
      node.type === 'VariableDeclarator' &&
      node.init?.type === 'CallExpression' &&
      (node.init.callee.name === 'Router' ||
        memberName(node.init.callee) === 'Router')
    )
      routers.add(node.id.name);
  });
  let addedAlias;
  do {
    addedAlias = false;
    walk(ast, (node) => {
      if (
        node.type === 'VariableDeclarator' &&
        node.id.type === 'Identifier' &&
        node.init?.type === 'Identifier' &&
        routers.has(node.init.name) &&
        !routers.has(node.id.name)
      ) {
        routers.add(node.id.name);
        addedAlias = true;
      }
    });
  } while (addedAlias);
  const owner = (node) =>
    node?.type === 'Identifier'
      ? node.name
      : node?.type === 'CallExpression'
        ? owner(node.callee?.object)
        : undefined;
  walk(ast, (node) => {
    if (
      node.type !== 'CallExpression' ||
      node.callee.type !== 'MemberExpression'
    )
      return;
    if (!routers.has(owner(node.callee.object))) return;
    const method = memberName(node.callee);
    if (
      routers.has(owner(node.callee.object)) &&
      node.callee.computed &&
      !method
    ) {
      throw new Error(
        `${file}:${node.loc.start.line}: dynamic route method cannot be checked; use router.post/put/patch with literal paths; edit ${REGISTRY}; template ${TEMPLATE}`,
      );
    }
    if (!['post', 'put', 'patch', 'all'].includes(method)) return;
    const argument = routeBase(node.callee.object) || node.arguments[0];
    const paths =
      argument?.type === 'ArrayExpression' ? argument.elements : [argument];
    for (const item of paths) {
      const url = literal(item);
      if (url === undefined)
        throw new Error(
          `${file}:${node.loc.start.line}: use a literal route path before registering it in ${REGISTRY}; template ${TEMPLATE}`,
        );
      const methods = method === 'all' ? ['post', 'put', 'patch'] : [method];
      for (const verb of methods)
        routes.push({
          key: `${file} ${verb.toUpperCase()} ${url}`,
          file,
          line: node.loc.start.line,
        });
    }
  });
  return routes;
}
function routeFiles(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) return routeFiles(full);
      return /\.(?:js|cjs|mjs)$/.test(entry.name) &&
        !/\.(?:test|spec)\./.test(entry.name)
        ? [full]
        : [];
    });
}
function scanRoutes(root) {
  return routeFiles(path.join(root, 'backend/src/routes')).flatMap((file) =>
    scanSource(fs.readFileSync(file, 'utf8'), path.relative(root, file)),
  );
}
function readJson(root, file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
}
function check(root = ROOT, { baselineRoutes } = {}) {
  const registry = readJson(root, REGISTRY);
  const legacy = readJson(root, 'lifecycle/legacy-routes.json');
  const routes = scanRoutes(root);
  const errors = [];
  const fail = (message) => errors.push(message);
  const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
  const exists = (file) =>
    typeof file === 'string' && fs.existsSync(path.join(root, file));
  const current = new Set(routes.map((route) => route.key));
  const registered = new Set();
  const ids = new Set();
  for (const resource of registry.resources) {
    if (!resource.id || ids.has(resource.id))
      fail(`${REGISTRY}: resource id must be unique`);
    ids.add(resource.id);
    if (!resource.routes?.length)
      fail(`${REGISTRY}: ${resource.id} has no routes; copy ${TEMPLATE}`);
    for (const route of resource.routes || []) {
      const key = `${resource.routeFile} ${route}`;
      if (registered.has(key)) fail(`${REGISTRY}: duplicate route ${key}`);
      registered.add(key);
      if (!current.has(key))
        fail(`${REGISTRY}: ${key} does not exist; fix routeFile/routes`);
    }
    const m = resource.matrix;
    if (
      !m ||
      ![
        'path',
        'table',
        'create',
        'edit',
        'invalid',
        'blank',
        'clear',
        'clearStatus',
        'filter',
      ].every((key) => Object.hasOwn(m, key)) ||
      !m.invalid?.length ||
      ![200, 400].includes(m.clearStatus) ||
      !/^[a-z_]+$/.test(m.table) ||
      !m.path?.startsWith('/api/v1/') ||
      ![m.create, m.edit, m.blank, m.clear].every(
        (input) => input && Object.keys(input).length,
      ) ||
      !Object.values(m.clear).includes(null)
    ) {
      fail(
        `${REGISTRY}: ${resource.id} needs all lifecycle matrix cases; copy ${TEMPLATE} and run ${MATRIX}`,
      );
    }
    const update = resource.update;
    if (!exists(update?.file)) {
      fail(
        `${REGISTRY}: ${resource.id} needs update.file/handler; use backend/src/utils/partialUpdate.js; template ${TEMPLATE}`,
      );
    } else {
      let handler;
      walk(parse(read(update.file)), (node) => {
        if (
          node.type === 'VariableDeclarator' &&
          node.id.name === update.handler
        )
          handler = node.init;
        if (
          node.type === 'FunctionDeclaration' &&
          node.id.name === update.handler
        )
          handler = node;
      });
      let usesHelper = false;
      walk(handler, (node) => {
        if (
          node.type === 'CallExpression' &&
          node.callee.name === 'partialUpdate'
        )
          usesHelper = true;
      });
      if (!usesHelper)
        fail(
          `${update.file}: ${update.handler} must construct updates with partialUpdate from backend/src/utils/partialUpdate.js; template ${TEMPLATE}`,
        );
    }
  }
  const known =
    baselineRoutes ||
    (() => {
      const files = execFileSync(
        'git',
        ['ls-tree', '-r', '--name-only', BASE, 'backend/src/routes'],
        { cwd: root, encoding: 'utf8' },
      )
        .trim()
        .split('\n');
      return new Set(
        files
          .filter((file) => /\.js$/.test(file) && !/\.(test|spec)\./.test(file))
          .flatMap((file) =>
            scanSource(
              execFileSync('git', ['show', `${BASE}:${file}`], {
                cwd: root,
                encoding: 'utf8',
              }),
              file,
            ).map((route) => route.key),
          ),
      );
    })();
  const exempt = new Set();
  if (legacy.baseline !== BASE)
    fail(`lifecycle/legacy-routes.json: baseline must remain ${BASE}`);
  for (const entry of legacy.routes) {
    if (!entry.reason?.trim())
      fail(
        `lifecycle/legacy-routes.json: ${entry.key} needs a concrete retention reason`,
      );
    if (!known.has(entry.key))
      fail(
        `lifecycle/legacy-routes.json: ${entry.key} is new since PR #62 and cannot be exempted; register it in ${REGISTRY}; template ${TEMPLATE}`,
      );
    exempt.add(entry.key);
  }
  for (const route of routes) {
    if (!registered.has(route.key) && !exempt.has(route.key))
      fail(
        `${route.file}:${route.line}: unregistered ${route.key}; edit ${REGISTRY}, copy ${TEMPLATE}, and exercise ${MATRIX}`,
      );
  }
  for (const list of registry.lists) {
    if (
      !exists(list.file) ||
      !/\buseListUrlState\s*\(/.test(read(list.file)) ||
      /\b(?:useBrowserQuery|replaceBrowserUrl|replaceBrowserQuery)\s*\(|history\.(?:replaceState|pushState)\s*\(|\[\s*(?:keyword|status|page|pageSize|currentPage)\s*,[^\]]*\]\s*=\s*useState\b/.test(
        read(list.file),
      )
    ) {
      fail(
        `${list.file}: use frontend/src/lib/hooks/useListUrlState.ts for ${list.id}; template ${TEMPLATE}; test ${LIST_MATRIX}`,
      );
    }
    if (
      !exists(list.test) ||
      !list.path ||
      !list.schema ||
      !list.keywordKey ||
      !list.pageKey ||
      !list.pageSizeKey ||
      !list.tabKey ||
      !list.tab
    )
      fail(
        `${REGISTRY}: ${list.id} needs a list lifecycle test and URL fields; copy ${TEMPLATE}`,
      );
  }
  for (const file of [MATRIX, LIST_MATRIX])
    if (!exists(file))
      fail(`${file}: missing generic lifecycle matrix; copy ${TEMPLATE}`);
  if (
    !read('backend/package.json').includes(
      'src/integration/resource-lifecycle.integration.js',
    )
  )
    fail(`backend/package.json: add ${MATRIX} to test:db`);
  if (errors.length)
    throw new Error(
      errors.join('\n') +
        `\nRepair the named file and ${REGISTRY}; template ${TEMPLATE}; tests ${MATRIX} and ${LIST_MATRIX}`,
    );
  return {
    routes: routes.length,
    resources: registry.resources.length,
    lists: registry.lists.length,
    legacy: exempt.size,
  };
}
if (require.main === module) {
  try {
    console.log('Lifecycle PASS', JSON.stringify(check()));
  } catch (error) {
    console.error(`Lifecycle FAIL\n${error.message}`);
    process.exitCode = 1;
  }
}
module.exports = { check, scanSource, scanRoutes, BASE };
