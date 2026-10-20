/**
 * Input: Express app
 * Output: 应用入口基础可用性测试
 * Pos: 后端入口测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const http = require('node:http');
const express = require('express');

const loadApp = (configOverride = {}) => {
  const originalLoad = Module._load;
  const appPath = require.resolve('./app');

  const noopMiddleware = (req, res, next) => next();
  const notFoundHandler = (req, res, next) => next();
  const errorHandler = (err, req, res, next) => next(err);

  Module._load = function patchedLoad(request, parent, isMain) {
    if (parent?.filename === appPath) {
      if (request === './config') {
        return {
          port: 3000,
          nodeEnv: 'test',
          cors: {
            origin: [],
            credentials: true,
          },
          ...configOverride,
        };
      }
      if (request === './routes') {
        return express.Router();
      }
      if (request === './middleware/errorHandler') {
        return { errorHandler, notFoundHandler };
      }
      if (request === './middleware/logger') {
        return { requestLogger: noopMiddleware };
      }
      if (request === './middleware/rateLimit') {
        return {
          gentleRateLimit: () => noopMiddleware,
        };
      }
      if (request === './jobs/inventoryAlertJob') {
        return {
          startInventoryAlertJob: () => {},
        };
      }
      if (request === './jobs/agentCredentialAlertJob') {
        return {
          startAgentCredentialAlertJob: () => {},
        };
      }
      if (request === './jobs/opsTaskReminderJob') {
        return {
          startOpsTaskReminderJob: () => {},
        };
      }
    }

    return originalLoad(request, parent, isMain);
  };

  delete require.cache[appPath];
  try {
    return require('./app');
  } finally {
    Module._load = originalLoad;
    delete require.cache[appPath];
  }
};

const startServer = async (app) => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
};

test('app: 以模块方式加载时不直接监听端口', () => {
  const app = loadApp();
  assert.equal(typeof app, 'function');
});

test('app: 默认不信任代理，显式白名单仅信任给定地址', () => {
  assert.equal(loadApp().get('trust proxy'), false);
  const trust = loadApp({ trustedProxyCidrs: ['127.0.0.1/32', '::1/128'] }).get('trust proxy fn');
  assert.equal(trust('127.0.0.1', 0), true);
  assert.equal(trust('::1', 0), true);
  assert.equal(trust('203.0.113.7', 0), false);
});

test('app: /health 返回基础健康信息', () => {
  const app = loadApp();
  const healthRouteLayer = app._router.stack.find(
    (layer) => layer.route?.path === '/health' && layer.route.methods?.get
  );

  assert.ok(healthRouteLayer, '应注册 GET /health 路由');

  let payload = null;
  const res = {
    json(data) {
      payload = data;
      return data;
    },
  };

  healthRouteLayer.route.stack[0].handle({}, res);

  assert.ok(payload, '/health 应返回 JSON 响应');
  assert.equal(payload.status, 'ok');
  assert.equal(payload.version, '1.0.0');
  assert.match(payload.timestamp, /^\d{4}-\d{2}-\d{2}T/);
});

test('app: 生产环境同源无 Origin 的请求仍可通过 CORS 到达路由', async () => {
  const app = loadApp({
    nodeEnv: 'production',
    cors: {
      origin: ['http://23.81.118.51'],
      credentials: true,
    },
  });
  const { server, baseUrl } = await startServer(app);

  try {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.status, 'ok');
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test('app: 生产环境显式非法 Origin 仍被拒绝', async () => {
  const app = loadApp({
    nodeEnv: 'production',
    cors: {
      origin: ['http://23.81.118.51'],
      credentials: true,
    },
  });
  const { server, baseUrl } = await startServer(app);

  try {
    const response = await fetch(`${baseUrl}/health`, {
      headers: {
        Origin: 'http://evil.example',
      },
    });
    assert.equal(response.status, 500);

    const body = await response.text();
    assert.match(body, /CORS origin not allowed/);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
