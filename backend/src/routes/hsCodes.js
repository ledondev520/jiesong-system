/**
 * Input: hsCodeService, aiService, aiCache, hsciqService, prisma（systemConfig 开关）
 * Output: HSCode 查询路由（含 AI 推荐 HS 编码 + HSCIQ 权威归类实例 + AI 申报要素填写 + 推荐缓存 + HSCIQ 使用统计）
 * Pos: 提供本地 HSCode 搜索、详情、AI推荐（集成 HSCIQ 归类实例辅助 + 申报要素自动填值 + 透明缓存 + 系统开关控制）接口
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { roleAuth } = require('../middleware/roleAuth');
const hsCodeService = require('../services/hsCodeService');
const aiService = require('../services/aiService');
const hsciqService = require('../services/hsciqService');
const aiCache = require('../utils/aiCache');
const prisma = require('../utils/prisma');
const { success } = require('../utils/response');
const { createError } = require('../middleware/errorHandler');

/**
 * 职责：判断 HSCIQ API 是否被系统设置开关启用
 * 思路：从 systemConfig 表读取 hsciqEnabled 配置项；未配置时默认关闭
 * @returns {Promise<boolean>}
 */
async function isHsciqToggleOn() {
  try {
    const row = await prisma.systemConfig.findUnique({ where: { key: 'hsciqEnabled' } });
    if (!row) return false;
    return row.value === 'true' || row.value === true;
  } catch {
    return false;
  }
}

/**
 * 职责：为本地库对照行附加置信分（0–100）
 * 思路：与税则完全一致时记 100；模糊召回先按 similarity 降序，再在相似度换算分上按名次递减，避免「全员同分」无法排序
 * @param {object[]} rows HS 记录行
 * @param {{ exactMatch?: boolean }} opts
 * @returns {object[]}
 */
function attachConfidenceToCandidates(rows, { exactMatch = false } = {}) {
  if (!Array.isArray(rows)) return [];
  if (exactMatch) {
    return rows.map((row) => ({ ...row, confidenceScore: 100 }));
  }
  const sorted = [...rows].sort(
    (a, b) => (b.similarity ?? 0) - (a.similarity ?? 0),
  );
  return sorted.map((row, index) => {
    const s = typeof row.similarity === 'number' ? row.similarity : 0;
    const base = Math.round(s * 100);
    const ranked = Math.max(0, Math.min(100, base - index * 4));
    return { ...row, confidenceScore: ranked };
  });
}

const router = Router();

router.use(authenticate);

/**
 * 职责：列表/搜索 HS 编码
 * 思路：
 *   1. keyword → 商品名称模糊搜索；code → HS 编码前缀搜索（两者可独立或组合）
 *   2. fuzzy=true 且有 keyword 时走相似度召回；否则走精确列表
 */
router.get('/', async (req, res, next) => {
  try {
    const { keyword, code, page, pageSize } = req.query;
    const useFuzzy = req.query.fuzzy === 'true' && (keyword || code);
    const results = useFuzzy
      ? await hsCodeService.fuzzySearchHsCodes({ keyword, code, page, pageSize })
      : await hsCodeService.listHsCodes({ keyword, code, page, pageSize });
    success(res, results);
  } catch (error) {
    next(error);
  }
});

router.get('/search', async (req, res, next) => {
  try {
    const results = await hsCodeService.searchByProductName(req.query.keyword);
    success(res, results);
  } catch (error) {
    next(error);
  }
});

/**
 * 职责：获取 HSCIQ 权威编码详情（税率、申报要素、监管条件、CIQ 等）
 * 思路：先检查 HSCIQ 可用性，调用 getCodeDetail 返回完整信息
 * GET /api/hs-codes/hsciq-detail/:code
 */
router.get('/hsciq-detail/:code', async (req, res, next) => {
  try {
    if (!(await isHsciqToggleOn())) {
      throw createError('HSCIQ API 未启用，请在系统设置中开启', 403);
    }
    if (!hsciqService.isAvailable()) {
      throw createError('HSCIQ 服务未配置', 503);
    }
    if (!hsciqService.hasQuota()) {
      throw createError('HSCIQ 今日调用额度已用完', 429);
    }
    const detail = await hsciqService.getCodeDetail(req.params.code, req.query.country || 'CN');
    success(res, detail);
  } catch (error) {
    next(error);
  }
});

/**
 * 职责：获取 HSCIQ API 使用统计（今日调用量、剩余配额）
 * GET /api/hs-codes/hsciq-usage
 */
router.get('/hsciq-usage', async (req, res, next) => {
  try {
    const enabled = await isHsciqToggleOn();
    const available = hsciqService.isAvailable();
    const stats = hsciqService.getUsageStats();
    success(res, { enabled, available, ...stats });
  } catch (error) {
    next(error);
  }
});

router.get('/:code', async (req, res, next) => {
  try {
    const record = await hsCodeService.searchByHsCode(req.params.code);

    if (!record) {
      throw createError('HSCode 不存在', 404);
    }

    success(res, record);
  } catch (error) {
    next(error);
  }
});

/**
 * AI 辅助填写指定 HS 编码申报要素
 * POST /api/hs-codes/:code/fill-declaration
 * Body: { productDescription: string, productName?: string }
 * 思路：
 * 1. 查询本地库获取该编码的申报要素列表（须存在）
 * 2. 以真实要素列表为模板，调用 AI 根据用户产品描述逐项填写具体申报值
 * 3. 返回填写好的数组，供前端展示和复制
 */
router.post(
  '/:code/fill-declaration',
  roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'),
  async (req, res, next) => {
    try {
      const { productDescription, productName } = req.body;
      // productDescription 选填，productName 必填（若仅填了 productName，以 productName 作为描述）
      const rawName = typeof productName === 'string' ? productName.trim() : '';
      const rawDesc = typeof productDescription === 'string' ? productDescription.trim() : '';
      if (!rawName && !rawDesc) {
        throw createError('productName 不能为空', 400);
      }

      const code = req.params.code;
      const record = await hsCodeService.searchByHsCode(code);
      if (!record) {
        throw createError('HSCode 不存在', 404);
      }

      // 1. 获取申报要素模板（优先 HSCIQ 官方 → 本地库 → AI 推断）
      let hsciqElements = [];
      const hsciqOn = await isHsciqToggleOn();
      if (hsciqOn && hsciqService.isAvailable() && hsciqService.hasQuota()) {
        try {
          const detail = await hsciqService.getCodeDetail(code, 'CN');
          const reporting = detail?.extensions?.cn?.reporting;
          if (Array.isArray(reporting) && reporting.length > 0) {
            hsciqElements = reporting.map((r) => r.value || r.key || '').filter(Boolean);
          }
        } catch (err) {
          console.warn('[hsCodes] HSCIQ getCodeDetail 失败:', err.message);
        }
      }

      const localElements =
        typeof record.declarationElements === 'string' && record.declarationElements.trim()
          ? record.declarationElements.split(/[|｜]/).map((e) => e.trim()).filter(Boolean)
          : [];

      const templateElements = hsciqElements.length > 0 ? hsciqElements : localElements;

      const keyword = rawDesc || rawName;
      const nameHint = rawName;

      let fillUserContent;
      if (templateElements.length > 0) {
        const source = hsciqElements.length > 0 ? '（来源：海关官方税则库）' : '';
        fillUserContent = `产品描述：${keyword}${nameHint ? `\n商品名称：${nameHint}` : ''}\nHS编码：${code}\n商品分类：${record.productName}\n\n该编码的申报要素列表${source}（请为每项填写申报值）：\n${templateElements.map((e, i) => `${i + 1}. ${e}`).join('\n')}\n\n请为每个要素填写具体申报值，要求：值简洁规范，符合海关报关规范；若信息不足给出最合理的常见值并标注 uncertain: true。`;
      } else {
        fillUserContent = `产品描述：${keyword}${nameHint ? `\n商品名称：${nameHint}` : ''}\nHS编码：${code}\n商品分类：${record.productName}\n\n请根据该 HS 编码的商品类别，列出中国海关出口申报通常需要填写的申报要素（一般 4–8 项），并为每项填写具体申报值。`;
      }

      const fillMessages = [
        {
          role: 'system',
          content: `你是中国海关报关专家。根据产品描述，为出口申报要素填写具体内容。
要求：
1. 每个要素给出简洁、规范的申报值，符合海关报关规范。
2. 信息不足时给出最合理的常见值，并在 uncertain 字段标 true。
3. 数值带单位时保留单位（如"95%""2mm"）。
4. element 字段填写要素名称（去掉编号前缀），value 字段填写申报值。
5. 标准代码规则（必须遵守，直接写数字代码）：
   - 品牌类型：无品牌→0，有品牌但不知名→1，知名品牌→2
   - 出口享惠情况：不享受优惠→0，享受出口退税→0，其他→按实际填写
只输出 JSON 数组，不要有其他文字：
[{"element":"要素名","value":"申报值","uncertain":false}]`,
        },
        { role: 'user', content: fillUserContent },
      ];

      const { hsCodeModel: declFillModel } = await aiService.getConfiguredModels();
      const fillResult = await aiService.callAI(fillMessages, declFillModel);

      const userId = req.user?.id;
      if (userId && fillResult.tokenUsage) {
        try {
          await aiService.recordTokenUsage(
            userId,
            null,
            fillResult.model || declFillModel,
            fillResult.tokenUsage,
            'hs_code_declaration_fill',
            typeof fillResult.content === 'string' ? fillResult.content : undefined,
            keyword.slice(0, 500),
          );
        } catch (err) {
          console.error('[hsCodes] 记录申报要素填写Token消耗失败:', err);
        }
      }

      // 3. 解析 AI 返回的 JSON 数组
      let filledDeclarationElements = null;
      const arrMatch = fillResult.content.match(/\[[\s\S]*\]/);
      if (arrMatch) {
        filledDeclarationElements = JSON.parse(arrMatch[0]);
      }

      success(res, { filledDeclarationElements, rawElements: templateElements });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * 批量 HSCode 匹配接口
 * POST /api/hs-codes/batch-match
 * Body: { productNames: string[] }
 * 思路：开放给 SALES/PURCHASE/FINANCE 等角色，一键生成三张表时无需 ADMIN
 */
router.post('/batch-match', roleAuth('ADMIN', 'SALES', 'PURCHASE', 'FINANCE', 'WAREHOUSE'), async (req, res, next) => {
  try {
    const { productNames } = req.body;

    if (!Array.isArray(productNames)) {
      throw createError('productNames 必须是数组', 400);
    }

    if (productNames.length > 100) {
      throw createError('单次最多匹配 100 个商品', 400);
    }

    const results = await hsCodeService.batchMatchHsCodes(productNames);
    success(res, results);
  } catch (error) {
    next(error);
  }
});

/**
 * AI 推荐 HS 码接口
 * POST /api/hs-codes/ai-recommend
 * Body: { productDescription: string }
 * 思路：
 * 1. 直接根据产品描述调用大模型归类建议（不依赖本地库先召回）
 * 2. 解析模型 JSON 后，在本地库按推荐编码做对照查询
 * 3. 合并置信分、剔除与主推荐税号完全相同的候选行（避免与主卡片重复），再返回
 */
router.post(
  '/ai-recommend',
  roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'),
  async (req, res, next) => {
  try {
    const { productDescription } = req.body;
    if (!productDescription || typeof productDescription !== 'string' || !productDescription.trim()) {
      throw createError('productDescription 不能为空', 400);
    }

    const keyword = productDescription.trim();
    const forceRefresh = req.body.force === true;

    // 0. 缓存命中检查：force=true 时跳过缓存并清除旧条目
    if (forceRefresh) {
      aiCache.remove(keyword);
    } else {
      const cached = aiCache.get(keyword);
      if (cached) {
        await aiCache.simulateDelay();
        return success(res, cached);
      }
    }

    // 0.5 并行获取参考上下文：HSCIQ 归类实例 + 本地税则库
    let hsciqHint = '';
    let localHint = '';
    const hsciqOn = await isHsciqToggleOn();

    const contextTasks = [];

    // 0.5a HSCIQ 归类实例搜索（优先级最高：真实海关归类案例）
    if (hsciqOn && hsciqService.isAvailable() && hsciqService.hasQuota() && keyword.length >= 2) {
      contextTasks.push(
        hsciqService.searchInstance(keyword, { pageIndex: 1, pageSize: 8 })
          .then((instanceData) => {
            const items = (instanceData?.items || []).slice(0, 8);
            if (items.length > 0) {
              const lines = [];
              for (const inst of items) {
                const name = inst.instanceNamePlain || inst.instanceName || '';
                const cats = (inst.categoryResults || []).slice(0, 2);
                for (const cat of cats) {
                  for (const twoCode of (cat.twoCodeResults || []).slice(0, 2)) {
                    for (const fourCode of (twoCode.fourCodeResults || []).slice(0, 2)) {
                      for (const sixCode of (fourCode.sixCodeResults || []).slice(0, 2)) {
                        const docs = (sixCode.documents || []).slice(0, 2);
                        for (const doc of docs) {
                          const confirmedCodes = (doc.codes || [])
                            .filter((c) => c.source === 'CnConfirmed')
                            .map((c) => `${c.code} ${c.name}`);
                          if (confirmedCodes.length > 0) {
                            lines.push(`- 归类实例「${name}」→ ${confirmedCodes.join('；')}`);
                          }
                        }
                      }
                    }
                  }
                }
              }
              const uniqueLines = [...new Set(lines)].slice(0, 10);
              if (uniqueLines.length > 0) {
                hsciqHint = `\n\n以下是海关归类实例库中的真实归类案例（权威性高，务必重点参考）：\n${uniqueLines.join('\n')}`;
              }
            }
          })
          .catch((err) => {
            console.warn('[hsCodes] HSCIQ searchInstance 失败:', err.message);
          }),
      );
    }

    // 0.5b 本地税则库模糊搜索（兜底参考）
    if (keyword.length >= 2) {
      contextTasks.push(
        hsCodeService.fuzzySearchHsCodes({ keyword, page: '1', pageSize: '8' })
          .then((localResults) => {
            const topItems = (localResults.items || []).slice(0, 8);
            if (topItems.length > 0) {
              localHint = `\n\n以下是本地税则库中与该产品相关的编码，供参考：\n${topItems.map((i) => `- ${i.hsCode} ${i.productName}`).join('\n')}`;
            }
          })
          .catch(() => {}),
      );
    }

    await Promise.all(contextTasks);

    const referenceContext = hsciqHint + localHint;

    const messages = [
      {
        role: 'system',
        content: `你是中国海关进出口商品归类与 HS 编码专家。用户会描述产品，请你根据协调制度常用规则给出**最可能的一条**商品编码。

硬性要求：
1. hsCode 字段必须是**完整**的进出口商品编码数字串，优先输出 10 位（与常见海关税则条目一致）。
2. 禁止只输出 2～6 位「章/品目」缩写；若实在只能到较短位数，须在 reason 中明确说明不确定性。
3. **严格围绕用户描述的产品用途和材质进行归类**，不要偏离产品的主要用途。
4. productName 应简洁规范，与用户描述的产品一致。
5. 如果提供了海关归类实例或本地税则库参考编码，务必优先从中选择最合适的，除非你确信有更精确的编码。
6. 海关归类实例来源于真实归类案例，可信度极高，应作为首要参考依据。

只输出以下 JSON，不要有任何其他文字：
{"hsCode":"编码","productName":"报关商品名称（简短规范）","reason":"推荐理由（2-3句话，可提醒用户以海关正式归类为准）","confidence":85}
其中 confidence 须为 0～100 的整数，表示你对该归类建议的总体把握。`,
      },
      {
        role: 'user',
        content: `请为下列产品推荐最合适的 HS 编码：\n${keyword}${referenceContext}`,
      },
    ];

    const { hsCodeModel: recommendModel } = await aiService.getConfiguredModels();
    const result = await aiService.callAI(messages, recommendModel);

    // 2. 记录 Token 消耗（与 Kimi 实际使用的 model 一致，供全局统计与用量展示）
    const userId = req.user?.id;
    if (userId && result.tokenUsage) {
      try {
        await aiService.recordTokenUsage(
          userId,
          null,
          result.model || recommendModel,
          result.tokenUsage,
          'hs_code_recommend',
          typeof result.content === 'string' ? result.content : undefined,
          keyword.slice(0, 500),
        );
      } catch (err) {
        console.error('[hsCodes] 记录Token消耗失败:', err);
      }
    }

    // 3. 解析 AI 返回的 JSON
    let recommendation = null;
    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        recommendation = JSON.parse(jsonMatch[0]);
      }
    } catch {
      recommendation = null;
    }

    if (recommendation && typeof recommendation === 'object') {
      const c = recommendation.confidence;
      if (typeof c === 'number' && Number.isFinite(c)) {
        recommendation.confidence = Math.min(100, Math.max(0, Math.round(c)));
      } else {
        delete recommendation.confidence;
      }
    }

    // 4. 本地库对照：编码前缀 + 商品名文本双路召回，避免 AI 编码偏差时完全看不到相关商品
    let candidates = [];
    const candidateSeenIds = new Set();

    // 4.1 按 AI 推荐的 HS 编码在本地库查找
    if (recommendation && typeof recommendation.hsCode === 'string' && recommendation.hsCode.trim()) {
      const code = String(recommendation.hsCode).replace(/\s/g, '');
      const exact = await hsCodeService.searchByHsCode(code);
      if (exact) {
        candidateSeenIds.add(exact.id);
        candidates = attachConfidenceToCandidates([exact], { exactMatch: true });
      } else {
        const digits = code.replace(/\D/g, '');
        const lookupKey = digits.length >= 4 ? digits.slice(0, Math.min(12, digits.length)) : code.slice(0, 12);
        if (lookupKey.length >= 2) {
          const fuzzy = await hsCodeService.fuzzySearchHsCodes({
            code: lookupKey,
            page: '1',
            pageSize: '10',
          });
          const items = fuzzy.items || [];
          items.forEach((i) => candidateSeenIds.add(i.id));
          candidates = attachConfidenceToCandidates(items, { exactMatch: false });
        }
      }
    }

    // 4.2 按用户原始产品描述做文本召回（补充编码路径可能遗漏的相关商品）
    if (keyword.length >= 2) {
      const textFuzzy = await hsCodeService.fuzzySearchHsCodes({
        keyword,
        page: '1',
        pageSize: '5',
      });
      const textItems = (textFuzzy.items || []).filter((i) => !candidateSeenIds.has(i.id));
      if (textItems.length > 0) {
        const textCandidates = attachConfidenceToCandidates(textItems, { exactMatch: false });
        candidates = [...candidates, ...textCandidates];
      }
    }

    // 5. 主推荐置信分不低于本地对照最高分，避免「推荐 90、候选 95」的观感矛盾（在剔除重复行前计算）
    if (recommendation && typeof recommendation === 'object') {
      const maxLocal = candidates.reduce(
        (m, c) => Math.max(m, typeof c.confidenceScore === 'number' ? c.confidenceScore : 0),
        0,
      );
      const aiConf = typeof recommendation.confidence === 'number' ? recommendation.confidence : 0;
      recommendation.confidence = Math.min(100, Math.max(0, Math.round(Math.max(aiConf, maxLocal))));
    }

    // 6. 与主推荐税号完全相同的行不再作为「参考候选」重复展示（仅一条时常与主卡片重复）
    const recNorm =
      recommendation && typeof recommendation.hsCode === 'string'
        ? String(recommendation.hsCode).replace(/\s/g, '')
        : '';
    if (recNorm) {
      candidates = candidates.filter(
        (c) => String(c.hsCode).replace(/\s/g, '') !== recNorm,
      );
    }

    candidates.sort((a, b) => (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0));

    // 7. 填写申报要素（优先 HSCIQ 权威数据 → 本地库模板 → AI 推断）
    let filledDeclarationElements = null;
    let hsciqDetail = null; // 供前端展示完整编码详情
    if (recNorm && recommendation) {
      try {
        // 7.0 尝试从 HSCIQ 获取编码详情（含官方申报要素模板）
        let hsciqElements = [];
        if (hsciqOn && hsciqService.isAvailable() && hsciqService.hasQuota()) {
          try {
            hsciqDetail = await hsciqService.getCodeDetail(recNorm, 'CN');
            const reporting = hsciqDetail?.extensions?.cn?.reporting;
            if (Array.isArray(reporting) && reporting.length > 0) {
              hsciqElements = reporting.map((r) => r.value || r.key || '').filter(Boolean);
            }
          } catch (err) {
            console.warn('[hsCodes] HSCIQ getCodeDetail 失败:', err.message);
          }
        }

        // 7.1 确定申报要素模板来源
        const hsRecord = await hsCodeService.searchByHsCode(recNorm);
        const localElements =
          hsRecord && typeof hsRecord.declarationElements === 'string'
            ? hsRecord.declarationElements.split(/[|｜]/).map((e) => e.trim()).filter(Boolean)
            : [];

        // 优先级：HSCIQ 官方要素 > 本地库要素 > AI 自由推断
        const templateElements = hsciqElements.length > 0 ? hsciqElements : localElements;

        let fillUserContent;
        if (templateElements.length > 0) {
          const source = hsciqElements.length > 0 ? '（来源：海关官方税则库）' : '';
          fillUserContent = `产品描述：${keyword}\nHS编码：${recommendation.hsCode}\n商品名称：${recommendation.productName || ''}\n\n该编码的申报要素列表${source}（请为每项填写申报值）：\n${templateElements.map((e, i) => `${i + 1}. ${e}`).join('\n')}\n\n请为每个要素填写具体申报值：`;
        } else {
          fillUserContent = `产品描述：${keyword}\nHS编码：${recommendation.hsCode}\n商品名称：${recommendation.productName || ''}\n\n请根据该 HS 编码的商品类别，列出中国海关出口申报通常需要填写的申报要素（一般 3–8 项），并根据产品描述为每项填写具体申报值。`;
        }

        const fillMessages = [
          {
            role: 'system',
            content: `你是中国海关报关专家。根据产品描述，为出口申报要素填写具体内容。
要求：
1. 每个要素给出简洁、规范的申报值，符合海关报关规范。
2. 信息不足时给出最合理的常见值，并在 uncertain 字段标 true。
3. 数值带单位时保留单位（如"95%""2mm"）。
4. element 字段填写要素名称（去掉编号），value 字段填写申报值。
5. 标准代码规则（必须遵守，直接写数字代码）：
   - 品牌类型：无品牌→0，有品牌但不知名→1，知名品牌→2
   - 出口享惠情况：不享受优惠→0，享受出口退税→0，其他→按实际填写
只输出 JSON 数组，不要有其他文字：
[{"element":"要素名","value":"申报值","uncertain":false}]`,
          },
          {
            role: 'user',
            content: fillUserContent,
          },
        ];

        const fillResult = await aiService.callAI(fillMessages, recommendModel);

        // 7.2 记录申报要素填写的 Token 消耗
        if (userId && fillResult.tokenUsage) {
          try {
            await aiService.recordTokenUsage(
              userId,
              null,
              fillResult.model || recommendModel,
              fillResult.tokenUsage,
              'hs_code_declaration_fill',
              typeof fillResult.content === 'string' ? fillResult.content : undefined,
              keyword.slice(0, 500),
            );
          } catch (err) {
            console.error('[hsCodes] 记录申报要素填写Token消耗失败:', err);
          }
        }

        // 7.3 解析 AI 返回的 JSON 数组
        const arrMatch = fillResult.content.match(/\[[\s\S]*\]/);
        if (arrMatch) {
          filledDeclarationElements = JSON.parse(arrMatch[0]);
        }
      } catch (fillErr) {
        console.error('[hsCodes] 申报要素AI填写失败:', fillErr);
      }
    }

    const payload = {
      recommendation,
      rawResponse: result.content,
      candidates,
      filledDeclarationElements,
      hsciqDetail: hsciqDetail || null,
    };

    // 8. 写入缓存，下次相同查询直接返回
    if (recommendation) {
      aiCache.set(keyword, payload);
    }

    success(res, payload);
  } catch (error) {
    next(error);
  }
  }
);

module.exports = router;
