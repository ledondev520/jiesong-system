const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const procurementTemplateRoutes = require('./procurementTemplate');

// No credentials or live database are needed: authentication must reject before loading the CSV.
test('采购模板三个读取入口在未登录时返回 401', async (t) => {
  const app = express();
  app.use('/procurement-template', procurementTemplateRoutes);
  app.use((error, req, res, next) => res.status(error.statusCode || 500).json({ code: error.statusCode || 500 }));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/procurement-template`;
  for (const route of ['/stores', '/universal', '/stores/audit-store']) {
    const response = await fetch(base + route);
    assert.equal(response.status, 401, route);
    assert.equal((await response.json()).code, 401);
  }
});
