/**
 * Input: 设计文档 §5.8 的参考装柜用例（瓷砖/家具，40HQ 配置）
 * Output: 排柜不变量（不重叠、不越界、限重、承压、重货在底）、填充率下界、确定性与性能的契约测试
 * Pos: containerPacking.js 的回归测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { toCartonLines, packContainers, usableMm } = require('./containerPacking');
const { getContainerSpec, loadContainerConfig } = require('./containerSpecs');

const config = loadContainerConfig();
const spec = getContainerSpec();
const usable = usableMm(spec, config);
const payloadCap = Math.min(spec.safeGrossKg, spec.maxPayloadKg);

const CARTONS = {
  tile: { name: '瓷砖', category: '瓷砖', dims: [620, 620, 50], kg: 31 },
  sofa: { name: '沙发', category: '家具', dims: [2100, 950, 850], kg: 65 },
  chair: { name: '餐椅', category: '家具', dims: [650, 600, 950], kg: 14 },
  table: { name: '餐桌', category: '家具', dims: [1600, 900, 180], kg: 45, upright: false },
  stool: { name: '凳子', category: '家具', dims: [450, 450, 480], kg: 6 },
};

// 直接构造归一化行，确保用例只测排柜规则；画像数值取自配置。
const makeLine = (key, count, overrides = {}) => {
  const def = CARTONS[key];
  const profile = config.profiles[def.category === '瓷砖' ? 'tile' : 'furniture'];
  const [length, width, height] = def.dims;
  return {
    lineId: `L-${key}${overrides.suffix || ''}`, productId: key, name: def.name, color: '#000',
    cartons: count, kgPerCarton: def.kg,
    cartonMm: { length, width, height }, dimsSource: 'line',
    profile: def.category === '瓷砖' ? 'tile' : 'furniture',
    heavy: profile.heavy, upright: def.upright ?? profile.upright, maxStackKg: profile.maxStackKg,
    ...overrides,
  };
};

const pack = (lines) => packContainers(lines, spec, config);
const placed = (result, index = 0) => result.containers[index]?.cartons ?? 0;
const totalPlaced = (result) => result.containers.reduce((sum, container) => sum + container.cartons, 0);

const boxOf = (block) => ({
  x: block.x, y: block.y, z: block.z,
  dx: block.nx * block.cartonMm.length, dy: block.ny * block.cartonMm.width, dz: block.nz * block.cartonMm.height,
});
const intersect = (a, b) => a.x < b.x + b.dx && a.x + a.dx > b.x
  && a.y < b.y + b.dy && a.y + a.dy > b.y && a.z < b.z + b.dz && a.z + a.dz > b.z;

/** 每个用例都必须满足的物理不变量。 */
const assertInvariants = (lines, result) => {
  const byId = new Map(lines.map((line) => [line.lineId, line]));
  const count = new Map();
  for (const container of result.containers) {
    const boxes = container.blocks.map(boxOf);
    boxes.forEach((box, i) => {
      assert.ok(box.x >= 0 && box.y >= 0 && box.z >= 0, '块在可用空间内（下界）');
      assert.ok(box.x + box.dx <= usable.length && box.y + box.dy <= usable.width && box.z + box.dz <= usable.height,
        '块在可用空间内（上界）');
      for (let j = i + 1; j < boxes.length; j += 1) assert.equal(intersect(box, boxes[j]), false, `块 ${i}/${j} 重叠`);
    });
    assert.ok(container.grossKg <= payloadCap + 1e-6, `毛重 ${container.grossKg} 超过 ${payloadCap}`);
    container.blocks.forEach((block, i) => {
      count.set(block.lineId, (count.get(block.lineId) || 0) + block.cartons);
      const line = byId.get(block.lineId);
      assert.equal(block.cartons, block.nx * block.ny * block.nz);
      if (line.upright) assert.ok(block.cartonMm.height === line.cartonMm.height, '竖放箱不得翻转');
      if (block.z > 0) {
        const own = boxes[i];
        const supportArea = boxes
          .filter((other) => other.z + other.dz === own.z)
          .reduce((sum, other) => sum + Math.max(0, Math.min(own.x + own.dx, other.x + other.dx) - Math.max(own.x, other.x))
            * Math.max(0, Math.min(own.y + own.dy, other.y + other.dy) - Math.max(own.y, other.y)), 0);
        assert.ok(supportArea / (own.dx * own.dy) >= config.minSupportRatio - 1e-9, '悬空：支撑面积不足');
        // 独立的逐箱支撑：块内每个底层纸箱自己的底面都要有 ≥ minSupportRatio 落在下方块上（块平均会漏掉悬空单箱）。
        const { length: cl, width: cw } = block.cartonMm;
        for (let ci = 0; ci < block.nx; ci += 1) {
          for (let cj = 0; cj < block.ny; cj += 1) {
            const carton = { x: own.x + ci * cl, y: own.y + cj * cw, dx: cl, dy: cw };
            const under = boxes
              .filter((other) => other.z + other.dz === own.z)
              .reduce((sum, other) => sum + Math.max(0, Math.min(carton.x + cl, other.x + other.dx) - Math.max(carton.x, other.x))
                * Math.max(0, Math.min(carton.y + cw, other.y + other.dy) - Math.max(carton.y, other.y)), 0);
            assert.ok(under / (cl * cw) >= config.minSupportRatio - 1e-9,
              `${byId.get(block.lineId).name} 第 ${ci},${cj} 箱悬空：支撑 ${(under / (cl * cw)).toFixed(3)}`);
          }
        }
        if (line.heavy) {
          const below = container.blocks.filter((other, j) => j !== i && boxes[j].z + boxes[j].dz === own.z
            && Math.min(own.x + own.dx, boxes[j].x + boxes[j].dx) > Math.max(own.x, boxes[j].x)
            && Math.min(own.y + own.dy, boxes[j].y + boxes[j].dy) > Math.max(own.y, boxes[j].y));
          assert.ok(below.every((other) => byId.get(other.lineId).heavy), '重货只能压在重货上');
        }
      }
    });
    // 逐箱承压（独立的保守估算）：上方各块按其底面积均摊重量，落在本块上的部分平均分给本块各列。
    container.blocks.forEach((block, i) => {
      const line = byId.get(block.lineId);
      const own = boxes[i];
      const above = container.blocks.reduce((sum, other, j) => {
        if (j === i || boxes[j].z < own.z + own.dz) return sum;
        const overlap = Math.max(0, Math.min(own.x + own.dx, boxes[j].x + boxes[j].dx) - Math.max(own.x, boxes[j].x))
          * Math.max(0, Math.min(own.y + own.dy, boxes[j].y + boxes[j].dy) - Math.max(own.y, boxes[j].y));
        return sum + (other.kg * overlap) / (boxes[j].dx * boxes[j].dy);
      }, 0);
      assert.ok((block.nz - 1) * line.kgPerCarton + above / (block.nx * block.ny) <= line.maxStackKg + 1e-6,
        `${line.name} 承压超限`);
    });
  }
  for (const line of lines) {
    const missing = result.unplaced.filter((entry) => entry.lineId === line.lineId).reduce((sum, entry) => sum + entry.cartons, 0);
    assert.equal((count.get(line.lineId) || 0) + missing, line.cartons, `${line.name} 箱数守恒`);
  }
};

const tileBlocksOnlyOnTiles = (lines, result) => {
  const tileIds = new Set(lines.filter((line) => line.heavy).map((line) => line.lineId));
  return result.containers.every((container) => container.blocks
    .filter((block) => tileIds.has(block.lineId))
    .every((block) => block.z === 0 || container.blocks.some((other) => tileIds.has(other.lineId)
      && other.z + other.nz * other.cartonMm.height === block.z)));
};

test('A 瓷砖 700 箱：单柜装完，毛重 21700 kg，承压与重心合规', () => {
  const lines = [makeLine('tile', 700)];
  const result = pack(lines);
  assertInvariants(lines, result);
  assert.equal(result.containers.length, 1);
  assert.equal(placed(result), 700);
  assert.equal(result.containers[0].grossKg, 21700);
  assert.equal(result.unplaced.length, 0);
  assert.ok(Math.abs(result.containers[0].cogXmm - usable.length / 2) <= usable.length * 0.1, '重心偏离柜长中点超过 10%');
  assert.ok(tileBlocksOnlyOnTiles(lines, result));
});

test('A+ 瓷砖 800 箱：首柜不超 22 t，其余转入第二柜', () => {
  const lines = [makeLine('tile', 800)];
  const result = pack(lines);
  assertInvariants(lines, result);
  assert.ok(result.containers[0].grossKg <= 22000);
  assert.ok(placed(result, 0) >= 700, `首柜仅 ${placed(result, 0)} 箱`);
  assert.equal(result.containers.length, 2);
  assert.equal(totalPlaced(result), 800);
});

test('B2 餐椅 200 把：首柜至少 114 把且全部竖放，其余转入下一柜', () => {
  const lines = [makeLine('chair', 200)];
  const result = pack(lines);
  assertInvariants(lines, result);
  assert.ok(placed(result, 0) >= 114, `首柜仅 ${placed(result, 0)} 把`);
  assert.equal(totalPlaced(result), 200);
  assert.ok(result.containers.flatMap((container) => container.blocks).every((block) => block.cartonMm.height === 950));
});

test('B 家具混装：首柜至少装下 125/142 箱且不少于 46 CBM', () => {
  const lines = [makeLine('sofa', 12), makeLine('chair', 60), makeLine('table', 20), makeLine('stool', 50)];
  const result = pack(lines);
  assertInvariants(lines, result);
  assert.ok(placed(result, 0) >= 125, `首柜仅 ${placed(result, 0)} 箱`);
  assert.ok(result.containers[0].cargoCbm >= 46, `首柜仅 ${result.containers[0].cargoCbm} CBM`);
});

test('C 混装：300 瓷砖在首柜地面或瓷砖上，首柜至少 390/452 箱，重货不压非重货', () => {
  const lines = [makeLine('tile', 300), makeLine('sofa', 12), makeLine('chair', 80), makeLine('stool', 60)];
  const result = pack(lines);
  assertInvariants(lines, result);
  const tileLine = lines[0].lineId;
  const tilesInFirst = result.containers[0].blocks.filter((block) => block.lineId === tileLine)
    .reduce((sum, block) => sum + block.cartons, 0);
  assert.equal(tilesInFirst, 300);
  assert.ok(tileBlocksOnlyOnTiles(lines, result));
  assert.ok(placed(result, 0) >= 390, `首柜仅 ${placed(result, 0)} 箱`);
});

test('D 超门：高度在内尺寸内但超过柜门高度 → unplaced door', () => {
  const lines = [makeLine('stool', 1, { cartonMm: { length: 1000, width: 1000, height: 2620 }, kgPerCarton: 50 })];
  const result = pack(lines);
  assert.deepEqual(result.unplaced.map((entry) => entry.reason), ['door']);
  assert.equal(result.containers.length, 0);
});

test('E 超内尺寸：12100 mm 长的箱 → unplaced oversize', () => {
  const lines = [makeLine('table', 1, { cartonMm: { length: 12100, width: 1000, height: 1000 }, upright: false })];
  const result = pack(lines);
  assert.deepEqual(result.unplaced.map((entry) => entry.reason), ['oversize']);
});

test('F 不可叠放：maxStackKg 为 0 的箱上面不放任何东西', () => {
  const lines = [makeLine('stool', 40, { maxStackKg: 0, lineId: 'L-nostack' }), makeLine('chair', 40)];
  const result = pack(lines);
  assertInvariants(lines, result);
  const bottoms = result.containers.flatMap((container) => container.blocks.filter((block) => block.lineId === 'L-nostack'));
  assert.ok(bottoms.every((block) => block.nz === 1));
  const blocks = result.containers[0].blocks.map(boxOf);
  result.containers[0].blocks.forEach((block, i) => {
    if (block.lineId !== 'L-nostack') return;
    assert.ok(!blocks.some((other, j) => j !== i && other.z === blocks[i].z + blocks[i].dz
      && other.x < blocks[i].x + blocks[i].dx && other.x + other.dx > blocks[i].x
      && other.y < blocks[i].y + blocks[i].dy && other.y + other.dy > blocks[i].y));
  });
});

test('毛重限制：超过安全毛重的货物拆到下一柜', () => {
  const lines = [makeLine('stool', 400, { kgPerCarton: 100 })];
  const result = pack(lines);
  assertInvariants(lines, result);
  assert.ok(result.containers.length >= 2);
  assert.ok(result.containers.every((container) => container.grossKg <= payloadCap));
});

test('确定性：同输入逐字节相同；打乱输入行顺序结果不变', () => {
  const lines = [makeLine('sofa', 12), makeLine('chair', 60), makeLine('table', 20), makeLine('stool', 50), makeLine('tile', 100)];
  const first = JSON.stringify(pack(lines));
  assert.equal(JSON.stringify(pack(lines)), first);
  assert.equal(JSON.stringify(pack([...lines].reverse())), first);
  assert.equal(JSON.stringify(pack([lines[2], lines[4], lines[0], lines[3], lines[1]])), first);
});

test('性能：30 个 SKU 共 600 箱在 200 ms 内排完', () => {
  const lines = Array.from({ length: 30 }, (_, i) => makeLine(['chair', 'stool', 'table', 'sofa', 'tile'][i % 5], 20, { suffix: `-${i}` }));
  const started = process.hrtime.bigint();
  const result = pack(lines);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  assertInvariants(lines, result);
  assert.ok(ms < 200, `耗时 ${ms.toFixed(1)} ms`);
});

test('toCartonLines：箱规优先级、估算标记、缺失不伪造、画像匹配', () => {
  const items = [
    { id: 'a', productId: 'p1', boxes: 10, quantity: 10, grossWeight: 100, volume: 2, length: 500, width: 400, height: 300,
      product: { customsName: '瓷砖 600x600', category: { name: '瓷砖' } } },
    { id: 'b', productId: 'p2', boxes: 4, quantity: 4, grossWeight: 40, volume: 1, product: { customsName: '椅子' } },
    { id: 'c', productId: 'p3', boxes: 5, quantity: 5, grossWeight: 50, product: { customsName: '凳', length: 300, width: 300, height: 400 } },
    { id: 'd', productId: 'p4', boxes: 5, quantity: 20, grossWeight: 50, product: { customsName: '杯', length: 300, width: 300, height: 400 } },
    { id: 'e', productId: 'p5', boxes: 0, quantity: 1, product: { customsName: '无箱数' } },
  ];
  const lines = toCartonLines(items, spec, config);
  assert.deepEqual(lines.map((line) => [line.lineId, line.dimsSource]), [['a', 'line'], ['b', 'estimated'], ['c', 'product'], ['d', 'missing']]);
  assert.equal(lines[0].profile, 'tile');
  assert.equal(lines[0].heavy, true);
  assert.equal(lines[1].profile, 'furniture');
  assert.equal(lines[3].cartonMm, null);
  assert.equal(lines[1].kgPerCarton, 10);
  const volume = lines[1].cartonMm.length * lines[1].cartonMm.width * lines[1].cartonMm.height;
  assert.ok(Math.abs(volume / 1e9 - 0.25) < 0.01, '估算箱规体积≈ 体积÷箱数');
});

test('C5-01 归一化后边长为 0（0.1 mm）且无毛重：不再死循环，按缺少箱规阻塞', () => {
  const [line] = toCartonLines([{ id: 'tiny', boxes: 1, quantity: 1, length: 500, width: 500, height: 0.1 }], spec, config);
  assert.equal(line.cartonMm, null);
  assert.equal(line.dimsSource, 'missing');
  // 直接喂入未经 toCartonLines 的畸形行也必须被拒绝，且立即返回。
  const result = pack([makeLine('stool', 1, { kgPerCarton: 0, cartonMm: { length: 500, width: 500, height: 0.1 } })]);
  assert.equal(totalPlaced(result), 0);
  assert.deepEqual(result.unplaced.map((entry) => entry.reason), ['missing-dimensions']);
});

test('C5-01 超时隔离：buildLoadingPlan 对 0.1 mm 高、无毛重的装箱行 5 s 内返回并阻塞出货', () => {
  const script = `
    const { buildLoadingPlan } = require('./shipmentReadinessService');
    const { plan } = buildLoadingPlan({ packingItems: [{ id: 'tiny', boxes: 1, quantity: 1, volume: 0,
      length: 500, width: 500, height: 0.1 }] });
    console.log(JSON.stringify({ ready: plan.check.ready }));`;
  const run = spawnSync(process.execPath, ['-e', script], { cwd: __dirname, timeout: 5000, encoding: 'utf8' });
  assert.equal(run.error, undefined, `子进程超时或失败：${run.error}`);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), { ready: false });
});

test('C5-01 计算预算耗尽时 fail-closed：剩余箱进入 unplaced，不挂起', () => {
  const lines = [makeLine('stool', 50)];
  const result = packContainers(lines, spec, config, { budget: 1 });
  assert.equal(totalPlaced(result), 0);
  assert.equal(result.unplaced.reduce((sum, entry) => sum + entry.cartons, 0), 50);
});

test('C5-02 底座块只托住上层块的一部分：悬出的单箱必须另放，不得凭块平均支撑通过', () => {
  // 底座 9000×2000，上层 4 箱各 3000×2000（共 12000 长）：第 4 箱完全悬空，块平均支撑为 75%。
  const lines = [
    makeLine('tile', 1, { suffix: '-base', cartonMm: { length: 9000, width: 2000, height: 1500 }, kgPerCarton: 17600 }),
    makeLine('tile', 4, { suffix: '-upper', cartonMm: { length: 3000, width: 2000, height: 1100 }, kgPerCarton: 40,
      heavy: true }),
  ];
  const result = pack(lines);
  assertInvariants(lines, result);
  assert.equal(totalPlaced(result) + result.unplaced.reduce((sum, entry) => sum + entry.cartons, 0), 5);
  const floating = result.containers.flatMap((container) => container.blocks)
    .filter((block) => block.lineId === 'L-tile-upper' && block.z > 0 && block.x + block.nx * block.cartonMm.length > 9000);
  assert.deepEqual(floating, [], '上层块不得伸出底座');
});
