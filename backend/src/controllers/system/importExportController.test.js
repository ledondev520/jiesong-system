/**
 * Input: importExportController、exportService
 * Output: 导出子控制器测试
 * Pos: 后端控制器测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const importExportController = require('./importExportController');
const exportService = require('../../services/exportService');

const createMockRes = () => {
  const res = {
    statusCode: null,
    payload: null,
    headers: {},
    sentData: null,
  };

  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.payload = payload;
    return res;
  };
  res.setHeader = (name, value) => {
    res.headers[name] = value;
  };
  res.send = (data) => {
    res.sentData = data;
    return res;
  };

  return res;
};

test('exportData: 设置响应头并返回二进制内容', async () => {
  const originalExport = exportService.exportData;
  const fakeBuffer = Buffer.from('demo-content');
  let exportArgs = null;

  exportService.exportData = async (...args) => {
    exportArgs = args;
    return {
      contentType: 'text/csv',
      filename: 'report.csv',
      data: fakeBuffer,
    };
  };

  try {
    const req = { params: { type: 'sales' }, query: { month: '2026-03' }, user: { role: 'ADMIN' } };
    const res = createMockRes();
    let capturedError = null;

    await importExportController.exportData(req, res, (error) => {
      capturedError = error;
    });

    assert.equal(capturedError, null);
    assert.deepEqual(exportArgs, ['sales', { month: '2026-03' }, { includeBank: true, includeMoney: true }]);
    assert.equal(res.headers['Content-Type'], 'text/csv');
    assert.equal(res.headers['Content-Disposition'], 'attachment; filename=\"report.csv\"');
    assert.deepEqual(res.sentData, fakeBuffer);
  } finally {
    exportService.exportData = originalExport;
  }
});
