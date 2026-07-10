/**
 * Input: 商品名或 HSCode 查询参数、Prisma 客户端、aiService（懒加载）
 * Output: HSCode 查询结果、税率与带来源证据的人工更新
 * Pos: HSCode 服务层，负责本地商品编码检索与当前税则快照维护；batchMatchHsCodes 采用两轮策略提升准确率
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');
const { createError } = require('../middleware/errorHandler');
const LIST_CACHE_TTL_MS = 60 * 1000;
const listCache = new Map();

const RATE_UPDATE_FIELDS = ['taxRate', 'refundRate', 'exportTaxRate', 'vatRate'];
const TEXT_UPDATE_FIELDS = [
  'unit',
  'note',
  'declarationElements',
  'supervisionConditions',
  'inspectionQuarantine',
];

const getListCacheKey = ({ keyword, code, page, pageSize }) => JSON.stringify({ keyword, code, page, pageSize });

const getCachedList = (key) => {
  const cached = listCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.createdAt > LIST_CACHE_TTL_MS) {
    listCache.delete(key);
    return null;
  }
  return cached.value;
};

const setCachedList = (key, value) => {
  listCache.set(key, { createdAt: Date.now(), value });
  if (listCache.size > 100) {
    listCache.delete(listCache.keys().next().value);
  }
};

// 懒加载 aiService，避免循环依赖（aiService 不依赖本模块）
let _aiService = null;
const getAiService = () => {
  if (!_aiService) _aiService = require('./aiService');
  return _aiService;
};

const normalizeKeyword = (value) => String(value || '').trim();

/** 职责：判断是否像 HS 编码检索（仅数字、4–12 位，已 trim） */
const isHsCodeLikeQuery = (s) => /^\d{4,12}$/.test(s);

/**
 * 职责：计算两个字符串的 Dice 相似度（双字符 bigram 集合重叠）
 * 思路：
 *   1. 将两个字符串分别切成 2-char bigram 集合
 *   2. 计算交集大小 / (集合1大小 + 集合2大小) * 2
 *   3. 对于长度为1的字符串退化为字符集合 Jaccard
 *   4. 字符覆盖率加分：查询字符全部出现在商品名中时加分，解决中文助词拆分 bigram 的问题
 * @param {string} a - 查询关键词
 * @param {string} b - 商品名称
 * @returns {number} 0~1 的相似度分数
 */
function diceSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  // 1. 若 b 包含 a，给一个较高的基准分
  if (b.includes(a)) return 0.85 + Math.min(0.15, a.length / b.length * 0.15);

  // 2. 构造 bigram 集合
  const getBigrams = (str) => {
    const s = new Set();
    for (let i = 0; i < str.length - 1; i++) s.add(str.slice(i, i + 2));
    return s;
  };

  const bigrams1 = getBigrams(a);
  const bigrams2 = getBigrams(b);

  // 3. 单字符退化为字符集合
  if (bigrams1.size === 0 || bigrams2.size === 0) {
    const chars1 = new Set([...a]);
    const chars2 = new Set([...b]);
    let inter = 0;
    chars1.forEach((c) => { if (chars2.has(c)) inter++; });
    return (2 * inter) / (chars1.size + chars2.size);
  }

  let inter = 0;
  bigrams1.forEach((bg) => { if (bigrams2.has(bg)) inter++; });
  const diceScore = (2 * inter) / (bigrams1.size + bigrams2.size);

  // 4. 字符覆盖率加分：中文词汇常被助词（"制""的""用"等）拆分，导致 bigram 不连续
  //    但如果查询的每个字都出现在商品名中，语义相关性仍然很高
  if (a.length >= 2) {
    const queryChars = new Set([...a]);
    let matched = 0;
    queryChars.forEach((c) => { if (b.includes(c)) matched++; });
    const coverage = matched / queryChars.size;
    if (coverage >= 1) {
      return Math.max(diceScore, 0.4 + (a.length / b.length) * 0.3);
    }
    if (coverage >= 0.67) {
      return Math.max(diceScore, 0.25);
    }
  }

  return diceScore;
}

/**
 * 职责：列表查询 HS 编码，支持商品名称(keyword)和 HS 编码前缀(code)独立或组合搜索
 * 思路：
 *   1. keyword 非空时按商品名 contains 过滤
 *   2. code 非空时按 hsCode startsWith 前缀过滤
 *   3. 两者同时存在时取 AND 交集
 * @param {object} params
 * @param {string} [params.keyword] - 商品名称关键词
 * @param {string} [params.code] - HS 编码前缀（纯数字）
 * @param {number} [params.page]
 * @param {number} [params.pageSize]
 */
const listHsCodes = async ({ keyword = '', code = '', page = 1, pageSize = 50 } = {}) => {
  const normalizedKeyword = normalizeKeyword(keyword);
  const normalizedCode = normalizeKeyword(code).replace(/\D/g, '');
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const safePageSize = Math.min(Math.max(parseInt(pageSize, 10) || 50, 1), 200);
  const cacheKey = getListCacheKey({
    keyword: normalizedKeyword,
    code: normalizedCode,
    page: safePage,
    pageSize: safePageSize,
  });
  const cached = getCachedList(cacheKey);
  if (cached) {
    return cached;
  }

  // 1. 构建 where 条件：keyword → 商品名，code → 编码前缀，可组合（AND）
  const conditions = [];

  if (normalizedCode) {
    conditions.push({ hsCode: { startsWith: normalizedCode } });
  }

  if (normalizedKeyword) {
    if (!normalizedCode && isHsCodeLikeQuery(normalizedKeyword)) {
      conditions.push({
        OR: [
          { productName: { contains: normalizedKeyword } },
          { hsCode: { startsWith: normalizedKeyword } },
        ],
      });
    } else {
      conditions.push({ productName: { contains: normalizedKeyword } });
    }
  }

  const where = conditions.length > 1
    ? { AND: conditions }
    : conditions.length === 1
      ? conditions[0]
      : {};

  const [items, total] = await Promise.all([
    prisma.hsCode.findMany({
      where,
      orderBy: [
        { effectiveDate: 'desc' },
        { hsCode: 'asc' },
      ],
      skip: (safePage - 1) * safePageSize,
      take: safePageSize,
    }),
    prisma.hsCode.count({ where }),
  ]);

  const result = {
    items,
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages: Math.max(Math.ceil(total / safePageSize), 1),
    },
  };
  setCachedList(cacheKey, result);
  return result;
};

const searchByProductName = async (keyword) => {
  const normalizedKeyword = normalizeKeyword(keyword);

  if (!normalizedKeyword) {
    return [];
  }

  return prisma.hsCode.findMany({
    where: {
      productName: {
        contains: normalizedKeyword,
      },
    },
    orderBy: [
      { effectiveDate: 'desc' },
      { hsCode: 'asc' },
    ],
    take: 10,
  });
};

const searchByHsCode = async (code) => {
  const normalizedCode = normalizeKeyword(code);

  if (!normalizedCode) {
    return null;
  }

  return prisma.hsCode.findFirst({
    where: { hsCode: normalizedCode },
    orderBy: { effectiveDate: 'desc' },
  });
};

const getTaxRate = async (code) => {
  const record = await searchByHsCode(code);
  return record ? record.taxRate : null;
};

const parseRate = (field, value) => {
  if (value === null || value === '') {
    if (field === 'taxRate') throw createError('综合税率不能为空', 400);
    return null;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) {
    throw createError(`${field} 必须是 0–100 之间的数字`, 400);
  }
  return number;
};

const parseEffectiveDate = (value) => {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) throw createError('生效日期格式不正确', 400);
  return date;
};

const parseSourceUrl = (value) => {
  const raw = String(value || '').trim();
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported protocol');
    return url.toString();
  } catch {
    throw createError('官方来源链接必须是有效的 http(s) 地址', 400);
  }
};

/**
 * 职责：人工维护当前 HS 税则快照，并强制将税率变化绑定到生效日期和来源证据。
 */
const updateHsCode = async (code, payload = {}) => {
  const normalizedCode = String(code || '').replace(/\D/g, '');
  if (!/^\d{10}$/.test(normalizedCode)) throw createError('HS 编码必须为 10 位数字', 400);

  const existing = await prisma.hsCode.findUnique({ where: { hsCode: normalizedCode } });
  if (!existing) throw createError('HSCode 不存在', 404);

  const hasOwn = (field) => Object.prototype.hasOwnProperty.call(payload, field);
  const rateChanged = RATE_UPDATE_FIELDS.some(hasOwn);
  if (rateChanged && (!hasOwn('effectiveDate') || !hasOwn('sourceUrl'))) {
    throw createError('修改税率时必须同时填写生效日期和官方来源链接', 400);
  }

  const data = {};
  RATE_UPDATE_FIELDS.forEach((field) => {
    if (hasOwn(field)) data[field] = parseRate(field, payload[field]);
  });
  TEXT_UPDATE_FIELDS.forEach((field) => {
    if (hasOwn(field)) {
      const value = payload[field];
      data[field] = value === null ? null : String(value).trim() || null;
    }
  });
  if (hasOwn('effectiveDate')) data.effectiveDate = parseEffectiveDate(payload.effectiveDate);
  if (hasOwn('sourceUrl')) data.sourceUrl = parseSourceUrl(payload.sourceUrl);

  if (Object.keys(data).length === 0) throw createError('没有可更新的 HS 税则字段', 400);
  data.fetchedAt = new Date();

  const updated = await prisma.hsCode.update({
    where: { hsCode: normalizedCode },
    data,
  });
  listCache.clear();
  return updated;
};

/**
 * 将 Prisma HS 记录行转换为对外接口的 match 对象
 * @param {object} row - HS 记录行
 * @returns {object}
 */
function toMatchRecord(row) {
  return {
    id: row.id,
    hsCode: row.hsCode,
    productName: row.productName,
    taxRate: row.taxRate,
    refundRate: row.refundRate ?? null,
    exportTaxRate: row.exportTaxRate ?? null,
    vatRate: row.vatRate ?? null,
    unit: row.unit ?? null,
    declarationElements: row.declarationElements ?? null,
    supervisionConditions: row.supervisionConditions ?? null,
  };
}

/**
 * 批量 HSCode 匹配（两轮策略）
 * 思路：
 * 第一轮（本地）：精确匹配 → 模糊/bigram（similarity ≥ 0.65 视为足够）
 * 第二轮（AI）：将第一轮低置信度/未命中商品合并为单次 AI Prompt，AI 批量返回推荐 HS 码
 *              再回查本地 HS 库补充 taxRate/refundRate 等字段
 * 
 * @param {string[]} productNames - 商品名称列表（可带申报要素/规格拼接以增加语义）
 * @returns {Promise<Array>} - 每个商品名称对应的最佳匹配结果
 */
const batchMatchHsCodes = async (productNames) => {
  if (!Array.isArray(productNames) || productNames.length === 0) {
    return [];
  }

  const results = new Array(productNames.length).fill(null);
  const aiQueue = []; // { index, productName }

  // ── 第一轮：本地匹配 ────────────────────────────────────────────────────────
  for (let i = 0; i < productNames.length; i++) {
    const rawName = productNames[i];
    const q = normalizeKeyword(rawName);

    if (!q) {
      results[i] = { productName: rawName, hsCode: null, match: null, confidence: 'none' };
      continue;
    }

    // 1.1 精确匹配
    const exactRow = await prisma.hsCode.findFirst({
      where: { productName: q },
      orderBy: [{ effectiveDate: 'desc' }],
    });

    if (exactRow) {
      results[i] = { productName: rawName, hsCode: exactRow.hsCode, match: toMatchRecord(exactRow), confidence: 'exact' };
      continue;
    }

    // 1.2 模糊/bigram 搜索
    const fuzzyResult = await fuzzySearchHsCodes({ keyword: q, page: 1, pageSize: 3 });
    const best = fuzzyResult.items?.[0];
    const sim = typeof best?.similarity === 'number' ? best.similarity : 0;

    if (best && sim >= 0.65) {
      results[i] = {
        productName: rawName,
        hsCode: best.hsCode,
        match: toMatchRecord(best),
        confidence: sim >= 0.85 ? 'high' : 'low',
      };
    } else {
      // 1.3 本地置信度不足 → 进入 AI 队列
      aiQueue.push({ index: i, productName: q });
    }
  }

  // ── 第二轮：AI 批量推荐（单次调用覆盖所有低置信商品）────────────────────────
  if (aiQueue.length > 0) {
    try {
      const aiService = getAiService();
      const productList = aiQueue.map((x, j) => `${j + 1}. ${x.productName}`).join('\n');

      const prompt = `你是中国海关进出口商品归类专家。为以下${aiQueue.length}个商品名称分别推荐最合适的10位HS编码。

商品列表：
${productList}

规则：
- hsCode必须是10位完整数字编码（例如8513101000）
- confidence为0-100整数，把握高则高分
- 若无法确定，confidence给30以下并说明

只输出JSON数组（按商品顺序，index从0开始）：
[{"index":0,"hsCode":"8513101000","productName":"报关商品名称","confidence":85}]`;

      const aiResult = await aiService.callAI([
        { role: 'system', content: '你是中国海关HS编码专家。只输出JSON数组，不要有其他文字。' },
        { role: 'user', content: prompt },
      ], aiService.MODELS.fast);

      const jsonMatch = aiResult.content.match(/\[[\s\S]*\]/);
      const aiRecs = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

      for (const rec of aiRecs) {
        const queueItem = aiQueue[rec.index];
        if (!queueItem) continue;

        const { index, productName: rawName } = queueItem;
        const code = String(rec.hsCode || '').replace(/\D/g, '');

        if (!code) {
          results[index] = { productName: productNames[index], hsCode: null, match: null, confidence: 'none' };
          continue;
        }

        // 回查本地 HS 库补充税率/退税率等字段
        const dbRow = await searchByHsCode(code);
        const confidence = typeof rec.confidence === 'number' && rec.confidence >= 60 ? 'high' : 'low';

        results[index] = {
          productName: productNames[index],
          hsCode: code,
          match: dbRow
            ? toMatchRecord(dbRow)
            : { id: null, hsCode: code, productName: rec.productName || rawName, taxRate: null, refundRate: null, exportTaxRate: null, vatRate: null, unit: null, declarationElements: null, supervisionConditions: null },
          confidence,
        };
      }
    } catch (err) {
      console.error('[batchMatchHsCodes] AI 兜底匹配失败:', err.message);
    }

    // 兜底：AI 未能覆盖的项目标为 none
    for (const { index } of aiQueue) {
      if (!results[index]) {
        results[index] = { productName: productNames[index], hsCode: null, match: null, confidence: 'none' };
      }
    }
  }

  return results;
};

/**
 * 职责：对商品名称做模糊相似度搜索，返回结果含 similarity 分数（0~1）
 * 思路：
 *   0. 若关键词为纯数字（4–12 位），仅做 HS 编码前缀匹配（不走 bigram 文本召回，避免数字拆分成无意义 bigram 污染结果）
 *      0.1 若精确前缀无结果，递减截断前缀长度（10→8→6→4）重试，扩大召回范围
 *   1. 非数字关键词：做商品名 contains 精确包含匹配（限量 300）
 *   2. 非数字关键词：用关键词各 bigram 追加候选（OR LIKE 查询）
 *   3. 对未预置 similarity 的候选用 Dice 计算相似度，过滤 < 0.2 的噪声
 *   4. 降序排列后分页返回
 * @param {{ keyword: string, code: string, page: number, pageSize: number }} params
 */
const fuzzySearchHsCodes = async ({ keyword = '', code = '', page = 1, pageSize = 20 } = {}) => {
  const q = normalizeKeyword(keyword);
  const codePrefix = normalizeKeyword(code).replace(/\D/g, '');
  if (!q && !codePrefix) return listHsCodes({ page, pageSize });

  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const safePageSize = Math.min(Math.max(parseInt(pageSize, 10) || 20, 1), 200);

  const seenIds = new Set();
  const candidates = [];

  // 0. 独立 code 参数：纯前缀匹配 HS 编码（若无结果则逐位截短重试）
  if (codePrefix) {
    const byCodePrefix = await prisma.hsCode.findMany({
      where: { hsCode: { startsWith: codePrefix } },
      take: 400,
    });
    for (const row of byCodePrefix) {
      if (seenIds.has(row.id)) continue;
      seenIds.add(row.id);
      const sim = row.hsCode === codePrefix ? 1 : 0.95;
      candidates.push({ ...row, similarity: sim });
    }

    // 0a. 若精确前缀无结果，逐位截短重试
    if (candidates.length === 0 && codePrefix.length > 4) {
      for (let len = codePrefix.length - 1; len >= 4; len--) {
        const shorter = codePrefix.slice(0, len);
        const byShort = await prisma.hsCode.findMany({
          where: { hsCode: { startsWith: shorter } },
          take: 400,
        });
        for (const row of byShort) {
          if (seenIds.has(row.id)) continue;
          seenIds.add(row.id);
          const sim = 0.5 + (shorter.length / codePrefix.length) * 0.4;
          candidates.push({ ...row, similarity: sim });
        }
        if (candidates.length > 0) break;
      }
    }
  }

  // 0.1 纯数字关键词（旧兼容）：仅做 HS 编码前缀匹配，跳过 bigram 文本召回
  const isNumericQuery = !codePrefix && isHsCodeLikeQuery(q);
  if (isNumericQuery) {
    // 0.1a 先用完整前缀搜索
    const byHsCode = await prisma.hsCode.findMany({
      where: { hsCode: { startsWith: q } },
      take: 400,
    });
    for (const row of byHsCode) {
      if (seenIds.has(row.id)) continue;
      seenIds.add(row.id);
      const sim = row.hsCode === q ? 1 : 0.95;
      candidates.push({ ...row, similarity: sim });
    }

    // 0.1b 若精确前缀无结果，逐位截短前缀重试（如 85249090→8524909→852490→85249→8524）
    if (candidates.length === 0 && q.length > 4) {
      for (let len = q.length - 1; len >= 4; len--) {
        const shorterPrefix = q.slice(0, len);
        const byShort = await prisma.hsCode.findMany({
          where: { hsCode: { startsWith: shorterPrefix } },
          take: 400,
        });
        for (const row of byShort) {
          if (seenIds.has(row.id)) continue;
          seenIds.add(row.id);
          const prefixMatchLen = shorterPrefix.length;
          const sim = 0.5 + (prefixMatchLen / q.length) * 0.4;
          candidates.push({ ...row, similarity: sim });
        }
        if (candidates.length > 0) break;
      }
    }
  }

  // 对于纯数字查询，跳过文本相似度路径（steps 1~2），直接到排序分页
  if (!isNumericQuery && !codePrefix) {
    // 1. 精确包含匹配（限量 300 条，用于快速召回）
    const exactItems = await prisma.hsCode.findMany({
      where: { productName: { contains: q } },
      take: 300,
    });
    for (const row of exactItems) {
      if (seenIds.has(row.id)) continue;
      seenIds.add(row.id);
      candidates.push(row);
    }

    // 2. Bigram 候选召回：合并为单次 OR 查询，减少 DB 往返次数
    if (q.length >= 2) {
      const bigrams = [];
      for (let i = 0; i < q.length - 1; i++) bigrams.push(q.slice(i, i + 2));
      const uniqueBigrams = [...new Set(bigrams)].slice(0, 6);

      const bigramRows = await prisma.hsCode.findMany({
        where: {
          OR: uniqueBigrams.map((bg) => ({ productName: { contains: bg } })),
        },
        take: 600,
      });

      for (const row of bigramRows) {
        if (!seenIds.has(row.id)) {
          seenIds.add(row.id);
          candidates.push(row);
        }
      }
    }
  } else if (q && !isNumericQuery) {
    // 同时有 code 和非数字 keyword 时：按商品名过滤已有 code 前缀候选
    const nameFiltered = await prisma.hsCode.findMany({
      where: {
        AND: [
          codePrefix ? { hsCode: { startsWith: codePrefix } } : {},
          { productName: { contains: q } },
        ],
      },
      take: 300,
    });
    for (const row of nameFiltered) {
      if (seenIds.has(row.id)) continue;
      seenIds.add(row.id);
      candidates.push(row);
    }
  }

  // 3. 相似度评分并过滤（步骤 0 已写入 similarity 的编码命中行保持不变）
  const THRESHOLD = 0.2;
  const scored = candidates
    .map((item) => {
      if (typeof item.similarity === 'number') return item;
      return { ...item, similarity: diceSimilarity(q || codePrefix, item.productName) };
    })
    .filter((item) => item.similarity >= THRESHOLD)
    .sort((a, b) => b.similarity - a.similarity);

  // 4. 分页
  const total = scored.length;
  const items = scored.slice((safePage - 1) * safePageSize, safePage * safePageSize);

  return {
    items,
    fuzzy: true,
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages: Math.max(Math.ceil(total / safePageSize), 1),
    },
  };
};

module.exports = {
  listHsCodes,
  fuzzySearchHsCodes,
  searchByProductName,
  searchByHsCode,
  updateHsCode,
  getTaxRate,
  batchMatchHsCodes,
};
