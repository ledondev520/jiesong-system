/** 已确认退税清单含票面核验行，附件下载/删除必须与确认接口保持财务权限边界。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
// 下载/删除按 realpath 限定在 UPLOAD_DIR 内：用临时根，且必须在加载上传模块前设置
const uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-file-controller-'));
const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-file-outside-'));
const previousUploadDir = process.env.UPLOAD_DIR;
process.env.UPLOAD_DIR = uploadRoot;
fs.writeFileSync(path.join(uploadRoot, 'test-only-preparation.xlsx'), 'synthetic');
const controller = require('./fileController');
const files = require('../services/fileService');
test.after(() => {
  fs.rmSync(uploadRoot, { recursive: true, force: true });
  fs.rmSync(outsideDir, { recursive: true, force: true });
  if (previousUploadDir === undefined) delete process.env.UPLOAD_DIR; else process.env.UPLOAD_DIR = previousUploadDir;
});

test('退税确认附件：拒绝非财务下载或删除，管理员可下载；普通三单不受影响', async () => {
  const originalFind = files.findFileById;
  const originalDelete = files.deleteFileRecord;
  let deletions = 0;
  let downloads = 0;
  let record = { id: 'file-test', category: 'SYSTEM_GENERATED_XLSX', description: '退税出货清单确认:test:version', filePath: 'test-only-preparation.xlsx', fileName: '虚构清单.xlsx' };
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

test('到货照片：非到货角色不能通过通用入口删除', async () => {
  const originalFind = files.findFileById;
  const originalDelete = files.deleteFileRecord;
  let deletions = 0;
  files.findFileById = async () => ({ id: 'photo-1', contractType: 'PURCHASE', category: 'RECEIPT_PHOTO', description: null });
  files.deleteFileRecord = async () => { deletions++; return {}; };
  const res = { status() { return this; }, json() {} };
  try {
    let error;
    await controller.deleteFile({ params: { fileId: 'photo-1' }, user: { role: 'SALES' } }, res, value => { error = value; });
    assert.equal(error?.statusCode, 403);
    assert.equal(deletions, 0);
    await controller.deleteFile({ params: { fileId: 'photo-1' }, user: { role: 'WAREHOUSE' } }, res, value => { throw value; });
    assert.equal(deletions, 1);
  } finally { files.findFileById = originalFind; files.deleteFileRecord = originalDelete; }
});

test('下载：库内路径穿越、符号链接逃逸、指向目录的记录一律拒绝，根内普通文件与符号链接根不受影响', async () => {
  const secret = path.join(outsideDir, 'secret.txt');
  fs.writeFileSync(secret, 'synthetic-secret');
  fs.symlinkSync(secret, path.join(uploadRoot, 'link-out.txt'));
  fs.mkdirSync(path.join(uploadRoot, 'sub'));
  const originalFind = files.findFileById;
  let downloads = 0;
  const res = { download: () => { downloads++; }, status() { return this; }, json() {} };
  try {
    for (const filePath of ['../' + path.basename(outsideDir) + '/secret.txt', secret, 'link-out.txt', 'sub', 'a\0b']) {
      files.findFileById = async () => ({ id: 'f', description: null, filePath, fileName: 'x' });
      let error;
      await controller.downloadFile({ params: { fileId: 'f' }, user: { role: 'ADMIN' } }, res, (value) => { error = value; });
      assert.equal(error?.statusCode, 400, filePath);
    }
    assert.equal(downloads, 0);
    files.findFileById = async () => ({ id: 'f', description: null, filePath: 'test-only-preparation.xlsx', fileName: 'x' });
    await controller.downloadFile({ params: { fileId: 'f' }, user: { role: 'ADMIN' } }, res, (value) => { throw value; });
    assert.equal(downloads, 1);
  } finally { files.findFileById = originalFind; }
});
