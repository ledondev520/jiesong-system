/**
 * Input: 路由源码文件
 * Output: 写操作路由 RBAC 覆盖测试结果
 * Pos: 后端路由权限测试，确保所有写路由均接入 roleAuth
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROUTES_DIR = path.resolve(__dirname);
const WRITE_METHODS = ['post', 'put', 'patch', 'delete'];
const PUBLIC_WRITE_ROUTES = new Set([
  'auth POST /login',
  'auth POST /reset-password',
]);

const routeFiles = fs
  .readdirSync(ROUTES_DIR)
  .filter((name) => name.endsWith('.js'))
  .filter((name) => !name.endsWith('.test.js'))
  .filter((name) => name !== 'index.js');

const getWriteRouteBlocks = (source) => {
  const matches = source.match(/router\.(post|put|patch|delete)\([\s\S]*?\);/g);
  return Array.isArray(matches) ? matches : [];
};

const getRouteInfo = (fileName, block) => {
  const methodMatch = block.match(/router\.(post|put|patch|delete)\s*\(/);
  const pathMatch = block.match(/router\.(?:post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/);
  const method = methodMatch?.[1]?.toUpperCase() || 'UNKNOWN';
  const routePath = pathMatch?.[1] || 'UNKNOWN';
  const routeKey = `${fileName.replace('.js', '')} ${method} ${routePath}`;
  return { routeKey, method };
};

test('RBAC: all write routes include roleAuth protection', () => {
  const missingRoleAuth = [];

  for (const fileName of routeFiles) {
    const source = fs.readFileSync(path.join(ROUTES_DIR, fileName), 'utf8');
    const hasRouterLevelRoleAuth = /router\.use\(\s*roleAuth\(/.test(source);
    const writeBlocks = getWriteRouteBlocks(source);

    for (const block of writeBlocks) {
      const { routeKey, method } = getRouteInfo(fileName, block);

      if (!WRITE_METHODS.includes(method.toLowerCase())) {
        continue;
      }

      if (PUBLIC_WRITE_ROUTES.has(routeKey)) {
        continue;
      }

      const hasRouteLevelRoleAuth = /roleAuth\(/.test(block);
      if (!hasRouterLevelRoleAuth && !hasRouteLevelRoleAuth) {
        missingRoleAuth.push(routeKey);
      }
    }
  }

  assert.deepStrictEqual(
    missingRoleAuth,
    [],
    `以下写路由缺少 roleAuth: ${missingRoleAuth.join(', ')}`
  );
});
