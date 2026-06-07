/**
 * Input: financialStatementsService、FINANCIAL_STATEMENTS_FOLDER
 * Output: 会计报表目录导入配置测试
 * Pos: 财务报表服务测试，锁住目录配置 Interface
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const serviceModulePath = require.resolve('./financialStatementsService');

const loadServiceWithFolder = (folderPath) => {
  delete require.cache[serviceModulePath];
  process.env.FINANCIAL_STATEMENTS_FOLDER = folderPath;
  return require('./financialStatementsService');
};

test('importFromFolder: 使用 FINANCIAL_STATEMENTS_FOLDER 并允许空目录成功返回', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-statements-'));
  const originalFolder = process.env.FINANCIAL_STATEMENTS_FOLDER;

  try {
    const service = loadServiceWithFolder(tempDir);

    assert.equal(service.getStatementsFolder(), tempDir);
    assert.deepEqual(await service.importFromFolder(), {
      imported: 0,
      skipped: 0,
      errors: [],
    });
  } finally {
    if (originalFolder === undefined) {
      delete process.env.FINANCIAL_STATEMENTS_FOLDER;
    } else {
      process.env.FINANCIAL_STATEMENTS_FOLDER = originalFolder;
    }
    delete require.cache[serviceModulePath];
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
