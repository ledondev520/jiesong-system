/**
 * Input: real PDFKit bytes, Express carrier-check routes and private migrated SQLite
 * Output: four bounded multi-page, row-difference, image-only and malformed cases
 * Pos: extends the genuine-PDF happy path already in trade-lifecycle.integration.js
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash, randomBytes } = require('node:crypto');
const PDFDocument = require('pdfkit');

/**
 * 职责：收集 PDFKit 输出流，生成仅在内存中的真实 PDF。
 * @param {(document: PDFDocument) => void} draw 在文档上绘制合成文字或图片的回调
 * @returns {Promise<Buffer>} 文档结束后的完整 PDF 字节
 * @throws {Error} 绘制或 PDF 输出流失败时拒绝 Promise
 */
const makePdf = draw => new Promise((resolve, reject) => {
  const chunks = [];
  const document = new PDFDocument({ size: 'A4', margin: 40 });
  document.on('data', chunk => chunks.push(chunk));
  document.on('error', reject);
  document.on('end', () => resolve(Buffer.concat(chunks)));
  draw(document);
  document.end();
});

test('HTTP/SQLite: genuine carrier PDF edges keep comparisons and readiness honest', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-carrier-pdf-edges-'));
  fs.chmodSync(directory, 0o700);
  const database = path.join(directory, 'synthetic.db');
  const uploadRoot = path.join(directory, 'uploads');
  fs.mkdirSync(uploadRoot, { mode: 0o700 });
  process.env.DATABASE_URL = `file:${database}`;
  process.env.UPLOAD_DIR = uploadRoot;
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = randomBytes(32).toString('hex');
  process.env.TZ = 'UTC';
  // Exercise the production archive's permission tightening from a normal umask.
  const originalUmask = process.umask(0o022);
  let db, server;
  let requestSequence = 0;
  let fixtureSequence = 0;
  const auditRequests = new Set();
  /**
   * 职责：在快照或清理前等待本测试成功请求的异步审计全部落库。
   * @returns {Promise<void>} 全部审计已保存；没有待检查请求时立即完成
   * @throws {Error} 数据库查询失败或五秒内审计未齐时拒绝 Promise
   */
  const waitForAudit = async () => {
    if (!db || !auditRequests.size) return;
    const deadline = Date.now() + 5000;
    while (true) {
      const saved = await db.operationLog.findMany({
        where: { requestId: { in: [...auditRequests] } }, select: { requestId: true },
      });
      const persisted = new Set(saved.map(row => row.requestId));
      if ([...auditRequests].every(id => persisted.has(id))) return;
      assert.ok(Date.now() < deadline, 'synthetic carrier audit writes must settle');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  };
  t.after(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
    await waitForAudit();
    if (db) await db.$disconnect();
    // This directory contains only this test's disposable database and archives.
    fs.rmSync(directory, { recursive: true, force: true });
    process.umask(originalUmask);
  });
  // Replay committed migrations. Never touch a business DB, db push or shared generation.
  const migrations = path.resolve(__dirname, '../../prisma/migrations');
  const ddl = fs.readdirSync(migrations).sort()
    .filter(name => fs.statSync(path.join(migrations, name)).isDirectory())
    .map(name => fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8')).join('\n');
  execFileSync('python3', ['-c',
    'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()',
    database], { input: ddl, timeout: 30000 });
  fs.chmodSync(database, 0o600);
  assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  assert.equal(fs.statSync(uploadRoot).mode & 0o777, 0o700);
  assert.equal(fs.statSync(database).mode & 0o777, 0o600);
  db = require('../utils/prisma');
  const tokens = {};
  const users = {};
  for (const role of ['SALES', 'FINANCE']) {
    users[role] = await db.user.create({ data: {
      username: `synthetic-carrier-${role}`, name: `Synthetic ${role}`,
      password: randomBytes(32).toString('hex'), role,
    } });
    tokens[role] = require('jsonwebtoken').sign({ userId: users[role].id }, process.env.JWT_SECRET);
  }
  const app = require('../app'); // Actual authentication, limiter, upload, extractor and archive.
  server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  /**
   * 职责：以真实角色调用当前 Express 接口，断言状态并登记需等待的审计。
   * @param {string} method HTTP 方法
   * @param {string} route 相对于 /api/v1 的接口路径
   * @param {object|FormData|undefined} body JSON、multipart 请求体或无请求体
   * @param {{role?: string, expected?: number, audited?: boolean}} [options] 角色、预期状态及成功请求审计标志
   * @returns {Promise<object>} 解析后的完整 JSON 响应信封
   * @throws {Error} 请求、响应解析或预期 HTTP 状态断言失败时拒绝 Promise
   */
  const call = async (method, route, body, { role = 'SALES', expected = 200, audited = false } = {}) => {
    const requestId = `synthetic-carrier-${++requestSequence}`;
    const response = await fetch(base + route, {
      method,
      headers: { authorization: `Bearer ${tokens[role]}`, 'x-request-id': requestId,
        ...(body instanceof FormData ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
    });
    const payload = await response.json();
    assert.equal(response.status, expected, `${method} ${route}: ${payload.message}`);
    if (audited && response.status >= 200 && response.status < 300) auditRequests.add(requestId);
    return payload;
  };
  /**
   * 职责：通过真实 multipart 核对入口提交合成 PDF 字节。
   * @param {object} fixture 含 sale.id 的合成出货夹具
   * @param {Buffer} bytes 正常或损坏的内存 PDF 字节
   * @param {number} [expected=201] 预期 HTTP 状态
   * @returns {Promise<object>} 核对入口的完整 JSON 响应信封
   * @throws {Error} 请求或 HTTP 状态断言失败时拒绝 Promise
   */
  const uploadPdf = async (fixture, bytes, expected = 201) => {
    const body = new FormData();
    body.append('file', new Blob([bytes], { type: 'application/pdf' }), 'synthetic-carrier-packing.pdf');
    return call('POST', `/sales/${fixture.sale.id}/packing-list-check`, body, { expected, audited: true });
  };
  /**
   * 职责：以 FINANCE 身份读取指定合成出货及报关单的内部准备度。
   * @param {object} fixture 含 sale.id 和 declaration.id 的合成夹具
   * @returns {Promise<object>} 响应 data 中的完整内部准备清单
   * @throws {Error} 请求、响应解析或 HTTP 状态断言失败时拒绝 Promise
   */
  const preparation = async fixture => (await call('GET',
    `/tax-refunds/workbench/${fixture.sale.id}/preparation?customsDeclarationId=${fixture.declaration.id}`,
    undefined, { role: 'FINANCE' })).data;
  /**
   * 职责：从内部准备清单选取现有船司装箱数据一致性检查项。
   * @param {{checklist: Array<object>}} result 内部准备度响应
   * @returns {object|undefined} document-consistency 检查项；未提供该项时为 undefined
   */
  const consistency = result => result.checklist.find(item => item.id === 'document-consistency');
  const supplier = await db.supplier.create({ data: {
    name: 'Synthetic carrier supplier', taxId: 'SYNTHETIC-CARRIER-TAX',
  } });
  const products = [];
  for (const [index, name] of ['SYNTHETIC CARRIER PLATE', 'SYNTHETIC CARRIER CUP'].entries()) {
    const hsCode = `999999990${index + 1}`;
    products.push(await db.product.create({ data: {
      customsName: name, unit: '件', hsCode, declaration: 'Synthetic ordinary parameters',
    } }));
    await db.hsCode.create({ data: {
      hsCode, productName: name, taxRate: 0, vatRate: 13, refundRate: 13,
      effectiveDate: new Date('2026-01-01'),
    } });
  }
  const quantities = [47, 83];
  const boxes = [3, 7];
  const costs = [531.1, 1875.8];
  /**
   * 职责：建立只缺船司核对的两商品合成出货及真实三单、报关和发票依据。
   * 思路：私有库创建采购/装箱来源，调用既有三单生成入口，再补合成已放行报关行和票面事实。
   * @param {string} label 本测试内唯一的合同与报关编号后缀
   * @returns {Promise<{sale: object, declaration: object, rows: Array<object>}>} 合成出货、报关单及按创建时间排序的装箱行
   * @throws {Error} 夹具持久化、三单请求或响应断言失败时拒绝 Promise
   */
  const makeFixture = async label => {
    const sequence = ++fixtureSequence;
    const invoiceNo = String(26110000000000000000n + BigInt(sequence));
    const purchase = await db.purchaseContract.create({ data: {
      contractNo: `CG-SYNTHETIC-CARRIER-${label}`, supplierId: supplier.id,
      totalAmount: 2406.9, taxRate: 13, status: 'COMPLETED', invoiceNo,
      items: { create: products.map((product, index) => ({
        productId: product.id, quantity: quantities[index], unit: '件', unitPrice: (index + 1) * 10,
        totalPrice: costs[index],
      })) },
    }, include: { items: true } });
    const sale = await db.salesContract.create({ data: {
      contractNo: `EXP-SYNTHETIC-CARRIER-${label}`, exchangeRate: 7.2, status: 'SHIPPED',
      shippedAt: new Date('2026-10-01T12:00:00Z'), hasTaxRefund: true,
      totalBoxes: 10, grossWeight: 250, netWeight: 220, volume: 1.3,
      packingItems: { create: products.map((product, index) => ({
        productId: product.id, purchaseItemId: purchase.items.find(item => item.productId === product.id).id,
        quantity: quantities[index], unit: '件', boxes: boxes[index],
        grossWeight: [100, 150][index], netWeight: [90, 130][index], volume: [0.4, 0.9][index],
        specification: 'Synthetic ordinary size', purchaseContractNo: purchase.contractNo,
        manufacturer: supplier.name, invoiceNo, purchaseCost: costs[index],
        unitPrice: 1, totalPrice: quantities[index],
        // The existing comparator visits rows in createdAt order; keep PDF order explicit.
        createdAt: new Date(`2026-10-01T12:00:0${index}Z`),
      })) },
    } });
    const packet = (await call('POST', `/sales/${sale.id}/export-packet/generate`, {
      spotRate: 7.2, sellerName: 'Synthetic seller', buyerName: 'Synthetic buyer',
      packageKind: 'CARTON', tradeTerm: 'FOB', documentDate: '2026-10-01',
    }, { expected: 201 })).data;
    const rows = await db.packingItem.findMany({ where: { salesContractId: sale.id }, orderBy: { createdAt: 'asc' } });
    const declaration = await db.customsDeclaration.create({ data: {
      declarationNo: `SYNTHETIC-CARRIER-DECLARATION-${label}`, salesContractId: sale.id,
      status: 'RELEASED', currency: 'USD', exportDate: new Date('2026-10-01T12:00:00Z'),
      totalQuantity: 130, totalAmount: packet.packet.summary.totalUsd,
      items: { create: rows.map((row, index) => ({
        productId: row.productId, packingItemId: row.id, itemNo: index + 1,
        customsName: products[index].customsName, quantity: row.quantity, unit: row.unit,
        unitPrice: row.unitPrice, totalPrice: row.totalPrice,
      })) },
    } });
    const batch = await db.financeDataBatch.create({ data: {
      type: 'INVOICE', fileName: `synthetic-carrier-fixture-${label}`, recordCount: 1,
    } });
    await db.invoiceRecord.create({ data: {
      batchId: batch.id, invNo: invoiceNo, seller: supplier.name, sellerTaxId: supplier.taxId,
      buyer: 'Synthetic buyer', invDate: '2026-10-01',
      itemName: products.map(product => product.customsName).join('；'),
      qty: 130, unit: '件', amount: 2130, tax: 276.9, total: 2406.9, taxRate: '13%',
      invoiceType: '增值税专用发票', status: '正常', isPositive: '是',
    } });
    return { sale, declaration, rows };
  };
  /**
   * 职责：生成两页、两商品且包含局部片段外参考数字的合成装箱单。
   * @param {object} fixture 含 sale.contractNo 的合成出货夹具
   * @param {boolean} [wrongQuantity=false] 是否仅把第一商品的数量从 47 改成 46
   * @returns {Promise<Buffer>} 内存中的完整两页 PDF 字节
   * @throws {Error} 绘制或 PDF 输出流失败时拒绝 Promise
   */
  const textPdf = (fixture, wrongQuantity = false) => makePdf(document => {
    document.text(`${fixture.sale.contractNo} Packing List\nCARRIER EDGE ORIGINAL\n` +
      'Total boxes 10 Gross Weight 250 Net Weight 220 Volume 1.3\n' +
      'External booking reference 47');
    document.text(`${products[0].customsName} Quantity ${wrongQuantity ? 46 : 47} Boxes 3 HS ${products[0].hsCode}`);
    document.addPage();
    document.text(`${products[1].customsName} Quantity 83 Boxes 7 HS ${products[1].hsCode}\nExternal reference 47`);
  });
  /**
   * 职责：核验真实核对记录、受限归档与认证下载均保留同一份 PDF 原件。
   * 思路：回读私有库结构化结果及文件关联，核对校验和/权限/磁盘字节，再比较 HTTP 下载字节。
   * @param {object} fixture 含 sale.id 的合成出货夹具
   * @param {object} check 真实核对 HTTP 响应中的 data 记录
   * @param {Buffer} bytes 上传的原始 PDF 字节
   * @returns {Promise<void>} 全部持久化、权限及字节断言通过后完成
   * @throws {Error} 回读、下载或任一档案断言失败时拒绝 Promise
   */
  const assertArchived = async (fixture, check, bytes) => {
    const saved = await db.packingListCheck.findUnique({ where: { id: check.id } });
    assert.equal(saved.salesContractId, fixture.sale.id);
    assert.equal(saved.checkedById, users.SALES.id);
    assert.equal(saved.salesContractFileId, check.file.id);
    assert.equal(saved.status, check.status);
    assert.equal(saved.automaticStatus, check.automaticStatus);
    assert.deepEqual(JSON.parse(saved.summaryJson), check.summary);
    assert.deepEqual(JSON.parse(saved.resultJson), check.comparison);
    assert.equal(saved.resultJson.includes('CARRIER EDGE ORIGINAL'), false, 'raw extracted text is not persisted');
    const file = await db.salesContractFile.findUnique({ where: { id: saved.salesContractFileId } });
    assert.equal(file.category, 'CARRIER_DOCUMENT');
    assert.equal(file.mimeType, 'application/pdf');
    assert.equal(file.fileSize, bytes.length);
    assert.equal(file.checksum, createHash('sha256').update(bytes).digest('hex'));
    assert.ok(file.filePath.startsWith(`carrier-documents${path.sep}`));
    const absolutePath = path.resolve(uploadRoot, file.filePath);
    assert.ok(absolutePath.startsWith(`${uploadRoot}${path.sep}`));
    assert.deepEqual(fs.readFileSync(absolutePath), bytes);
    assert.equal(fs.statSync(absolutePath).mode & 0o777, 0o600);
    assert.equal(fs.statSync(path.dirname(absolutePath)).mode & 0o777, 0o700);
    const download = await fetch(`${base}/sales/files/${file.id}/download`, {
      headers: { authorization: `Bearer ${tokens.SALES}` },
    });
    assert.equal(download.status, 200);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
  };
  // Independent read-only SQLite and archive snapshots prove rejection atomicity.
  /**
   * 职责：通过独立只读 SQLite 连接快照全部应用表及完整行值。
   * @returns {object} 按表名索引、按 rowid 排序的行数组，保留业务字段和时间戳
   * @throws {Error} 只读查询、子进程或 JSON 解析失败
   */
  const databaseSnapshot = () => JSON.parse(execFileSync('python3', ['-c',
    "import sqlite3,sys,json; c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); c.row_factory=sqlite3.Row; tables=[r[0] for r in c.execute(\"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name\")]; print(json.dumps({name:[dict(row) for row in c.execute('SELECT * FROM \\\"'+name+'\\\" ORDER BY rowid')] for name in tables})); c.close()",
    database], { encoding: 'utf8', timeout: 10000 }));
  /**
   * 职责：只读快照本测试归档树的相对路径、权限和文件校验和。
   * @returns {Array<object>} 排序后的目录/文件记录；上传根不存在时返回空数组
   * @throws {Error} 目录、文件属性或文件内容读取失败
   */
  const archiveSnapshot = () => {
    /**
     * 职责：递归读取当前合成归档目录，按名称排序并保留目录节点。
     * @param {string} directoryPath 本测试上传根内的绝对目录路径
     * @returns {Array<object>} 相对上传根的路径、权限以及普通文件 SHA-256 记录
     * @throws {Error} 目录、文件属性或文件内容读取失败
     */
    const visit = directoryPath => fs.readdirSync(directoryPath).sort().flatMap(name => {
      const absolutePath = path.join(directoryPath, name);
      const stat = fs.statSync(absolutePath);
      const record = { path: path.relative(uploadRoot, absolutePath), mode: stat.mode & 0o777,
        ...(stat.isFile() ? { checksum: createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex') } : {}) };
      return stat.isDirectory() ? [record, ...visit(absolutePath)] : [record];
    });
    return fs.existsSync(uploadRoot) ? visit(uploadRoot) : [];
  };
  let matchedFixture, matchedBytes;

  await t.test('two products across two PDF pages match, archive original bytes and unblock readiness', async () => {
    matchedFixture = await makeFixture('MATCH');
    const before = await preparation(matchedFixture);
    assert.equal(before.materialReady, false);
    assert.equal(consistency(before).status, 'missing');
    assert.equal(before.materialBlockers.length, 1, before.materialBlockers.join('；'));
    matchedBytes = await textPdf(matchedFixture);
    assert.equal(matchedBytes.subarray(0, 5).toString(), '%PDF-');
    assert.equal((matchedBytes.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 2);
    const check = (await uploadPdf(matchedFixture, matchedBytes)).data;
    assert.equal(check.status, 'PASSED');
    assert.equal(check.automaticStatus, 'PASSED');
    assert.equal(check.comparison.summary.fieldMismatched, 0);
    assert.equal(check.comparison.summary.itemCheckMismatched, 0);
    assert.deepEqual(check.comparison.items.map(item => item.packingItemId), matchedFixture.rows.map(row => row.id));
    for (const item of check.comparison.items) {
      assert.equal(item.identity.matched, true);
      assert.equal(item.quantity.matched, true);
      assert.equal(item.boxes.matched, true);
    }
    await assertArchived(matchedFixture, check, matchedBytes);
    const history = (await call('GET', `/sales/${matchedFixture.sale.id}/packing-list-checks`)).data;
    assert.equal(history.length, 1);
    assert.equal(history[0].id, check.id);
    const after = await preparation(matchedFixture);
    assert.equal(after.materialReady, true, after.materialBlockers.join('；'));
    assert.equal(consistency(after).status, 'ready');
    assert.equal(after.confirmationStatus, 'PENDING');
    assert.equal(await db.taxRefund.count(), 0, 'material readiness is not a formal filing');
  });

  await t.test('wrong first-row quantity differs even when expected digits occur outside its identity segment', async () => {
    const fixture = await makeFixture('DIFFERENCE');
    const bytes = await textPdf(fixture, true);
    const extracted = await require('../services/packingListCheckService')._internal.extractPdfText(bytes);
    assert.ok(extracted.includes('External booking reference 47'));
    assert.ok(extracted.includes(`${products[0].customsName} Quantity 46 Boxes 3`));
    assert.ok(extracted.includes(`${products[1].customsName} Quantity 83 Boxes 7`));
    assert.ok(extracted.includes('External reference 47'));
    const check = (await uploadPdf(fixture, bytes)).data;
    assert.equal(check.status, 'DIFFERENCE');
    assert.equal(check.automaticStatus, 'DIFFERENCE');
    assert.equal(check.comparison.summary.fieldMismatched, 0);
    assert.equal(check.comparison.summary.itemCheckMismatched, 1);
    assert.equal(check.comparison.items[0].identity.matched, true);
    assert.equal(check.comparison.items[0].boxes.matched, true);
    assert.deepEqual(check.comparison.items[0].quantity, { expected: 47, matched: false, closest: 46 });
    assert.equal(check.comparison.items[1].quantity.matched, true);
    assert.equal(check.comparison.items[1].boxes.matched, true);
    await assertArchived(fixture, check, bytes);
    const result = await preparation(fixture);
    assert.equal(result.materialReady, false);
    assert.equal(consistency(result).status, 'missing');
    assert.match(result.materialBlockers.join('；'), /船司装箱单未通过核对/);
  });

  await t.test('image-only genuine PDF archives the original and requires manual review', async () => {
    const fixture = await makeFixture('IMAGE');
    // A genuine embedded raster image, with no PDF text objects and no OCR call.
    const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=', 'base64');
    const bytes = await makePdf(document => document.image(pixel, 40, 40, { width: 300, height: 200 }));
    assert.match(bytes.toString('latin1'), /\/Subtype \/Image/);
    const check = (await uploadPdf(fixture, bytes)).data;
    assert.equal(check.status, 'NEEDS_MANUAL_REVIEW');
    assert.equal(check.automaticStatus, 'NEEDS_MANUAL_REVIEW');
    assert.equal(check.summary.manualReviewRequired, true);
    assert.equal(check.summary.ok, false);
    assert.equal(check.summary.pdfTextLength, 0);
    assert.equal(check.summary.pdfNumberCount, 0);
    assert.deepEqual(check.comparison.items, []);
    assert.deepEqual(check.comparison.fields, []);
    await assertArchived(fixture, check, bytes);
    const result = await preparation(fixture);
    assert.equal(result.materialReady, false);
    assert.equal(consistency(result).status, 'missing');
  });

  await t.test('truncated genuine PDF returns existing 422 without new archive, check or readiness mutation', async () => {
    assert.ok(matchedFixture && matchedBytes, 'the previously checked synthetic fixture exists');
    await waitForAudit();
    const beforeReadiness = await preparation(matchedFixture);
    assert.equal(beforeReadiness.materialReady, true);
    const beforeDatabase = databaseSnapshot();
    const beforeArchives = archiveSnapshot();
    const result = await uploadPdf(matchedFixture, matchedBytes.subarray(0, 64), 422);
    assert.equal(result.message, 'PDF 解析失败，请确认文件未损坏');
    assert.equal(result.data, null);
    assert.deepEqual(databaseSnapshot(), beforeDatabase);
    assert.deepEqual(archiveSnapshot(), beforeArchives);
    assert.deepEqual(await preparation(matchedFixture), beforeReadiness);
  });
});
