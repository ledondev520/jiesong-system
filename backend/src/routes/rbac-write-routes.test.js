/**
 * Input: 路由源码文件与明确列举的公开认证入口
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
  // 邮箱验证码注册在登录前完成；限流和校验由 auth 路由与注册服务执行。
  'auth POST /email-code',
  'auth POST /email-register',
  'ai POST /anthropic/v1/messages',
  'ai POST /anthropic/v1/messages/count_tokens',
  'mcp POST /',
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
      const hasAccessAuth = /accessAuth\(/.test(block);
      if (!hasRouterLevelRoleAuth && !hasRouteLevelRoleAuth && !hasAccessAuth) {
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

test('RBAC: 邮箱注册公开入口保留限流校验，管理员创建用户仍受保护', () => {
  const source = fs.readFileSync(path.join(ROUTES_DIR, 'auth.js'), 'utf8');
  const blocks = getWriteRouteBlocks(source);
  for (const routePath of ['/email-code', '/email-register']) {
    const block = blocks.find((item) => getRouteInfo('auth.js', item).routeKey === `auth POST ${routePath}`);
    assert.ok(block, `${routePath} 必须显式存在`);
    assert.match(block, /strictRateLimit\(/);
    assert.match(block, /emailRule\(\)/);
    assert.match(block, /handleValidation/);
  }
  const adminRegistration = blocks.find((item) => getRouteInfo('auth.js', item).routeKey === 'auth POST /register');
  assert.ok(adminRegistration);
  assert.match(adminRegistration, /authenticate/);
  assert.match(adminRegistration, /roleAuth\('ADMIN'\)/);
});
