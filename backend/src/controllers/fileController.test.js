/** 已确认退税清单含票面核验行，附件下载/删除必须与确认接口保持财务权限边界。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const controller = require('./fileController');
const files = require('../services/fileService');

test('退税确认附件：拒绝非财务下载或删除，管理员可下载；普通三单不受影响', async () => {
  const originalFind = files.findFileById;
  const originalDelete = files.deleteFileRecord;
  let deletions = 0;
  let downloads = 0;
  let record = { id: 'file-test', category: 'SYSTEM_GENERATED_XLSX', description: '退税出货清单确认:test:version', filePath: '/tmp/test-only-preparation.xlsx', fileName: '虚构清单.xlsx' };
  files.findFileById = async () => record;
  files.deleteFileRecord = async () => { deletions++; return record; };
  const res = { download: () => { downloads++; }, status() { return this; }, json() {} };
  try {
    for (const action of ['downloadFile', 'deleteFile']) {
      let error;
      await controller[action]({ params: { fileId: 'file-test' }, user: { role: 'SALES' } }, res, value => { error = value; });
      assert.equal(error?.statusCode, 403);
    }
    assert.equal(downloads, 0);
    assert.equal(deletions, 0);
    await controller.downloadFile({ params: { fileId: 'file-test' }, user: { role: 'ADMIN' } }, res, error => { throw error; });
    assert.equal(downloads, 1);
    record = { ...record, description: '出口三单生成版本' };
    await controller.downloadFile({ params: { fileId: 'file-test' }, user: { role: 'SALES' } }, res, error => { throw error; });
    assert.equal(downloads, 2);
  } finally { files.findFileById = originalFind; files.deleteFileRecord = originalDelete; }
});
