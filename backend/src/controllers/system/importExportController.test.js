/**
 * Input: importExportController、importService、exportService
 * Output: 导入导出子控制器测试
 * Pos: 后端控制器测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const importExportController = require('./importExportController');
const importService = require('../../services/importService');
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

test('importData: 未上传文件时返回400', async () => {
  const req = { file: null, user: { id: 'user-1' } };
  const res = createMockRes();
  let capturedError = null;

  await importExportController.importData(req, res, (error) => {
    capturedError = error;
  });

  assert.ok(capturedError);
  assert.equal(capturedError.statusCode, 400);
  assert.equal(capturedError.message, '请选择要导入的CSV文件');
});

test('importData: 调用导入服务并返回汇总信息', async () => {
  const originalImport = importService.importCSVData;
  let importArgs = null;

  importService.importCSVData = async (...args) => {
    importArgs = args;
    return { successRows: 8, failedRows: 2 };
  };

  try {
    const req = { file: { path: '/tmp/demo.csv' }, user: { id: 'user-1' } };
    const res = createMockRes();
    let capturedError = null;

    await importExportController.importData(req, res, (error) => {
      capturedError = error;
    });

    assert.equal(capturedError, null);
    assert.deepEqual(importArgs, ['/tmp/demo.csv', 'user-1']);
    assert.equal(res.payload.message, '导入完成：成功8条，失败2条');
  } finally {
    importService.importCSVData = originalImport;
  }
});

test('getImportRecords: 透传清洗后的分页与筛选参数', async () => {
  const originalGetRecords = importService.getImportRecords;
  let capturedArgs = null;

  importService.getImportRecords = async (...args) => {
    capturedArgs = args;
    return { records: [{ id: 'r-1' }], total: 1 };
  };

  try {
    const req = {
      query: {
        page: '2',
        pageSize: '10',
        status: ' FAILED ',
        keyword: ' demo ',
      },
    };
    const res = createMockRes();
    let capturedError = null;

    await importExportController.getImportRecords(req, res, (error) => {
      capturedError = error;
    });

    assert.equal(capturedError, null);
    assert.equal(capturedArgs[0], 2);
    assert.equal(capturedArgs[1], 10);
    assert.deepEqual(capturedArgs[2], { status: 'FAILED', keyword: 'demo' });
    assert.deepEqual(res.payload.data.items, [{ id: 'r-1' }]);
  } finally {
    importService.getImportRecords = originalGetRecords;
  }
});

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
    const req = { params: { type: 'sales' }, query: { month: '2026-03' } };
    const res = createMockRes();
    let capturedError = null;

    await importExportController.exportData(req, res, (error) => {
      capturedError = error;
    });

    assert.equal(capturedError, null);
    assert.deepEqual(exportArgs, ['sales', { month: '2026-03' }]);
    assert.equal(res.headers['Content-Type'], 'text/csv');
    assert.equal(res.headers['Content-Disposition'], 'attachment; filename=\"report.csv\"');
    assert.deepEqual(res.sentData, fakeBuffer);
  } finally {
    exportService.exportData = originalExport;
  }
});
