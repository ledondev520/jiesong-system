const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { generateFile } = require('./generate-export-packet');

test('脚本复用四单服务，不覆盖已有输出，文件0600，失败只删除本次预留文件', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'four-packet-cli-'));
  const previous = process.env.UPLOAD_DIR;
  try {
    const input = path.join(dir,'source.xlsx'), output = path.join(dir,'output.xlsx');
    await fs.writeFile(input,'synthetic source');
    const service = require('../src/services/exportPacketExcelService');
    const generator = t.mock.method(service,'generateExcelPacket', async (buffer, options) => {
      assert.equal(buffer.toString(),'synthetic source');assert.deepEqual(options,{});
      return { buffer: Buffer.from('synthetic four-sheet result'), packet: { lines: [{}] } };
    });
    assert.deepEqual(await generateFile({ input, output }), { sheetCount: 4, lineCount: 1 });
    assert.equal((await fs.stat(output)).mode & 0o777,0o600);
    await assert.rejects(() => generateFile({ input, output }), { code: 'EEXIST' });
    assert.equal(generator.mock.callCount(),1);
    assert.equal(await fs.readFile(output,'utf8'),'synthetic four-sheet result');
    generator.mock.mockImplementation(async () => { throw new Error('synthetic generation failure'); });
    const failed = path.join(dir,'failed.xlsx');
    await assert.rejects(() => generateFile({ input, output: failed }),/synthetic generation failure/);
    await assert.rejects(() => fs.stat(failed),{ code:'ENOENT' });
    assert.equal(await fs.readFile(input,'utf8'),'synthetic source');
  } finally {
    if (previous === undefined) delete process.env.UPLOAD_DIR; else process.env.UPLOAD_DIR = previous;
    await fs.rm(dir,{ recursive:true,force:true });
  }
});
