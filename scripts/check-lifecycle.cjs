const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const acorn = require('../backend/node_modules/acorn');

const ROOT = path.resolve(__dirname, '..');
const BASE = '56426be209e270024008b761dbd835a54a6c4c47';
const REGISTRY = 'lifecycle/resources.json';
const TEMPLATE = 'lifecycle/resource.template.json';
const SINGLETON_TEMPLATE = 'lifecycle/singleton-config.template.json';
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
function routeBase(node, routePaths) {
  if (node?.type === 'Identifier') return routePaths.get(node.name);
  if (node?.type !== 'CallExpression') return undefined;
  if (memberName(node.callee) === 'route') return node.arguments[0];
  return routeBase(node.callee?.object, routePaths);
}
function scanSource(source, file) {
  const routes = [];
  const ast = parse(source);
  const routers = new Set();
  const factories = new Set(['Router']);
  walk(ast, (node) => {
    if (
      node.type === 'VariableDeclarator' &&
      node.id.type === 'ObjectPattern' &&
      node.init?.callee?.name === 'require' &&
      literal(node.init.arguments[0]) === 'express'
    ) {
      for (const property of node.id.properties)
        if (
          property.key?.name === 'Router' &&
          property.value?.type === 'Identifier'
        )
          factories.add(property.value.name);
    }
  });
  walk(ast, (node) => {
    if (
      node.type === 'VariableDeclarator' &&
      node.init?.type === 'CallExpression' &&
      (factories.has(node.init.callee.name) ||
        memberName(node.init.callee) === 'Router')
    )
      routers.add(node.id.name);
  });
  const owner = (node) =>
    node?.type === 'Identifier'
      ? node.name
      : node?.type === 'CallExpression'
        ? owner(node.callee?.object)
        : undefined;
  const routePaths = new Map();
  let addedAlias;
  do {
    addedAlias = false;
    walk(ast, (node) => {
      if (
        node.type === 'VariableDeclarator' &&
        node.id.type === 'Identifier' &&
        routers.has(owner(node.init)) &&
        !routers.has(node.id.name)
      ) {
        routers.add(node.id.name);
        const base = routeBase(node.init, routePaths);
        if (base) routePaths.set(node.id.name, base);
        addedAlias = true;
      }
    });
  } while (addedAlias);
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
    const argument =
      routeBase(node.callee.object, routePaths) || node.arguments[0];
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
  const matrixPaths = new Set();
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
    const singleton = resource.kind === 'singleton-config';
    if (
      resource.kind !== undefined &&
      !['archive', 'singleton-config'].includes(resource.kind)
    )
      fail(`${REGISTRY}: ${resource.id} has unsupported resource kind`);
    if (singleton) {
      // Each singleton adapter owns an exact route and persistence contract.
      if (
        resource.id !== 'pricing-config' ||
        resource.routeFile !== 'backend/src/routes/system.js' ||
        resource.routes?.length !== 1 ||
        resource.routes[0] !== 'PUT /pricing-config' ||
        m?.path !== '/api/v1/system/pricing-config' ||
        matrixPaths.has(m?.path) ||
        m?.adapter !== 'pricing-config-file'
      )
        fail(
          `${REGISTRY}: ${resource.id} singleton matrix must exercise its own registered PUT route with a supported file adapter; copy ${SINGLETON_TEMPLATE}`,
        );
      const schema = readJson(root, 'config/pricing.schema.json');
      const validConfig = (value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value))
          return false;
        if (
          Object.keys(value).some(
            (key) => !Object.hasOwn(schema.properties, key),
          )
        )
          return false;
        return schema.required.every((key) => {
          const rule = schema.properties[key];
          const item = value[key];
          return rule.type === 'number'
            ? typeof item === 'number' &&
                Number.isFinite(item) &&
                item >= rule.minimum &&
                item <= rule.maximum
            : rule.enum.includes(item);
        });
      };
      if (
        !validConfig(m?.initial) ||
        !validConfig(m?.replace) ||
        schema.required.every((key) => m.initial[key] === m.replace[key]) ||
        !Array.isArray(m?.invalid) ||
        !m.invalid.length ||
        m.invalid.some(validConfig)
      )
        fail(
          `${REGISTRY}: ${resource.id} needs all singleton matrix cases (valid distinct complete snapshots and invalid replacements); copy ${SINGLETON_TEMPLATE} and run ${MATRIX}`,
        );
    } else {
      const createRoute = resource.routes?.find((route) =>
        route.startsWith('POST '),
      );
      const collection = createRoute?.slice(5).replace(/\/$/, '');
      if (
        collection === undefined ||
        resource.routes.length !== 2 ||
        !resource.routes.includes(`PUT ${collection}/:id`) ||
        typeof m?.path !== 'string' ||
        (collection && !m.path.replace(/\/$/, '').endsWith(collection)) ||
        matrixPaths.has(m.path)
      )
        fail(
          `${REGISTRY}: ${resource.id} matrix must exercise its own registered POST collection and PUT /:id routes; copy ${TEMPLATE}`,
        );
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
    }
    matrixPaths.add(m?.path);
    const update = resource.update;
    if (
      singleton &&
      (update?.file !== 'backend/src/controllers/system/pricingController.js' ||
        update?.handler !== 'updatePricing')
    )
      fail(
        `${REGISTRY}: ${resource.id} must use pricingController.updatePricing with updatePricingConfig; copy ${SINGLETON_TEMPLATE}`,
      );
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
      const helper = singleton ? 'updatePricingConfig' : 'partialUpdate';
      walk(handler, (node) => {
        if (
          node.type === 'CallExpression' &&
          (singleton
            ? memberName(node.callee) === helper
            : node.callee.name === helper)
        )
          usesHelper = true;
      });
      if (!usesHelper)
        fail(
          `${update.file}: ${update.handler} must construct updates with ${helper}${singleton ? ' (validated complete replacement)' : ' from backend/src/utils/partialUpdate.js'}; template ${singleton ? SINGLETON_TEMPLATE : TEMPLATE}`,
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
