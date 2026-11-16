#!/usr/bin/env node
/** Input: 出货xlsx和本票参数JSON。Output: 私有出口四单xlsx；复用网页生成器，不改业务库。 */
const fs = require('node:fs/promises');
const path = require('node:path');
const { parseArgs } = require('node:util');

const generateFile = async ({ input, output, options: optionsFile }) => {
  if (!input || !output) throw new Error('用法：node scripts/generate-export-packet.js --input 出货.xlsx --output 出口四单.xlsx [--options 本票参数.json]');
  const source = path.resolve(input), destination = path.resolve(output);
  const optionsPath = optionsFile ? path.resolve(optionsFile) : null;
  const backendDir = path.resolve(__dirname, '..');
  const { resolveWpsUploadRoot } = require('./wps-upload-dir');
  process.env.UPLOAD_DIR = resolveWpsUploadRoot({ backendDir });
  const service = require('../src/services/exportPacketExcelService');
  const stat = await fs.stat(source);
  if (!stat.isFile() || stat.size > service.MAX_FILE_BYTES) throw new Error('输入必须是不超过10MB的出货xlsx文件');
  let options = {};
  if (optionsPath) {
    const configStat = await fs.stat(optionsPath);
    if (!configStat.isFile() || configStat.size > 64 * 1024) throw new Error('本票参数JSON超过64KB或不是文件');
    options = JSON.parse(await fs.readFile(optionsPath, 'utf8'));
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('本票参数必须为JSON对象');
  }
  const buffer = await fs.readFile(source);
  // 先独占预留输出，拒绝覆盖原件；生成失败时只回收本次预留的文件。
  const handle = await fs.open(destination, 'wx', 0o600);
  const reserved = await handle.stat();
  try {
    const result = await service.generateExcelPacket(buffer, options);
    await handle.writeFile(result.buffer);
    return { sheetCount: 4, lineCount: result.packet.lines.length };
  } catch (error) {
    const current = await fs.lstat(destination).catch(() => null);
    if (current?.dev === reserved.dev && current?.ino === reserved.ino) await fs.unlink(destination);
    throw error;
  } finally {
    await handle.close();
    await require('../src/utils/prisma').$disconnect();
  }
};

if (require.main === module) {
  let values;
  try { ({ values } = parseArgs({ options: { input: { type: 'string' }, output: { type: 'string' }, options: { type: 'string' } } })); }
  catch { console.error('仅支持 --input、--output、--options 参数'); process.exitCode = 1; }
  if (values) generateFile(values).then(result => console.log(JSON.stringify(result)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { generateFile };
