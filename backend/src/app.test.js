/**
 * Input: Express app
 * Output: 应用入口基础可用性测试
 * Pos: 后端入口测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const express = require('express');

const loadApp = () => {
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

test('app: 以模块方式加载时不直接监听端口', () => {
  const app = loadApp();
  assert.equal(typeof app, 'function');
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
