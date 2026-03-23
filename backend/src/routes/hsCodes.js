/**
 * Input: hsCodeService, aiService
 * Output: HSCode 查询路由（含 AI 推荐 HS 编码 + AI 申报要素填写功能）
 * Pos: 提供本地 HSCode 搜索、详情、AI推荐（含申报要素自动填值）接口
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { roleAuth } = require('../middleware/roleAuth');
const hsCodeService = require('../services/hsCodeService');
const aiService = require('../services/aiService');
const { success } = require('../utils/response');
const { createError } = require('../middleware/errorHandler');

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

router.get('/', async (req, res, next) => {
  try {
    // 1. 若携带 keyword 且 fuzzy=true，走相似度搜索
    const useFuzzy = req.query.fuzzy === 'true' && req.query.keyword;
    const results = useFuzzy
      ? await hsCodeService.fuzzySearchHsCodes({
          keyword: req.query.keyword,
          page: req.query.page,
          pageSize: req.query.pageSize,
        })
      : await hsCodeService.listHsCodes({
          keyword: req.query.keyword,
          page: req.query.page,
          pageSize: req.query.pageSize,
        });
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

      // 1. 解析本地申报要素列表
      const elements =
        typeof record.declarationElements === 'string' && record.declarationElements.trim()
          ? record.declarationElements.split(/[|｜]/).map((e) => e.trim()).filter(Boolean)
          : [];

      // 以 description 为主，无 description 时回退到 productName
      const keyword = rawDesc || rawName;
      const nameHint = rawName;

      let fillUserContent;
      if (elements.length > 0) {
        // 2a. 有本地申报要素 → 逐项填值（最准确）
        fillUserContent = `产品描述：${keyword}${nameHint ? `\n商品名称：${nameHint}` : ''}\nHS编码：${code}\n商品分类：${record.productName}\n\n该编码的申报要素列表（请为每项填写申报值）：\n${elements.map((e, i) => `${i + 1}. ${e}`).join('\n')}\n\n请为每个要素填写具体申报值，要求：值简洁规范，符合海关报关规范；若信息不足给出最合理的常见值并标注 uncertain: true。`;
      } else {
        // 2b. 本地无申报要素 → AI 推断该编码通常需要哪些要素并填值
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
只输出 JSON 数组，不要有其他文字：
[{"element":"要素名","value":"申报值","uncertain":false}]`,
        },
        { role: 'user', content: fillUserContent },
      ];

      const fillResult = await aiService.callAI(fillMessages);

      const userId = req.user?.id;
      if (userId && fillResult.tokenUsage) {
        try {
          await aiService.recordTokenUsage(
            userId,
            null,
            fillResult.model || aiService.MODELS.fast,
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

      success(res, { filledDeclarationElements, rawElements: elements });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * 批量 HSCode 匹配接口
 * POST /api/hs-codes/batch-match
 * Body: { productNames: string[] }
 */
router.post('/batch-match', authenticate, roleAuth('ADMIN'), async (req, res, next) => {
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

    const messages = [
      {
        role: 'system',
        content: `你是中国海关进出口商品归类与 HS 编码专家。用户会描述产品，请你根据协调制度常用规则给出**最可能的一条**商品编码。
硬性要求：hsCode 字段必须是**完整**的进出口商品编码数字串，优先输出 10 位（与常见海关税则条目一致）。禁止只输出 2～6 位「章/品目」缩写（例如仅输出 4411 这类章节号视为不合格，必须细化到具体子目/十位码）；若实在只能到较短位数，须在 reason 中明确说明不确定性，并仍给出当前能力下最长的可能编码串。
只输出以下 JSON，不要有任何其他文字：
{"hsCode":"编码","productName":"报关商品名称（简短规范）","reason":"推荐理由（2-3句话，可提醒用户以海关正式归类为准）","confidence":85}
其中 confidence 须为 0～100 的整数，表示你对该归类建议的总体把握。`,
      },
      {
        role: 'user',
        content: `请为下列产品推荐最合适的 HS 编码：\n${keyword}`,
      },
    ];

    const result = await aiService.callAI(messages);

    // 2. 记录 Token 消耗（与 Kimi 实际使用的 model 一致，供全局统计与用量展示）
    const userId = req.user?.id;
    if (userId && result.tokenUsage) {
      try {
        await aiService.recordTokenUsage(
          userId,
          null,
          result.model || aiService.MODELS.fast,
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

    // 4. 本地库对照（可选）：便于与系统已导入税则比对，不替代模型结论
    let candidates = [];
    if (recommendation && typeof recommendation.hsCode === 'string' && recommendation.hsCode.trim()) {
      const code = String(recommendation.hsCode).replace(/\s/g, '');
      const exact = await hsCodeService.searchByHsCode(code);
      if (exact) {
        candidates = attachConfidenceToCandidates([exact], { exactMatch: true });
      } else {
        const digits = code.replace(/\D/g, '');
        const lookupKey = digits.length >= 4 ? digits.slice(0, Math.min(12, digits.length)) : code.slice(0, 12);
        if (lookupKey.length >= 2) {
          const fuzzy = await hsCodeService.fuzzySearchHsCodes({
            keyword: lookupKey,
            page: '1',
            pageSize: '10',
          });
          candidates = attachConfidenceToCandidates(fuzzy.items || [], { exactMatch: false });
        }
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

    // 7. 调用 AI 生成并填写申报要素
    //    思路：
    //    7.1 先查本地库，若找到该编码的申报要素则以此为模板请 AI 逐项填值（更准确）
    //    7.2 若本地库无该记录或无申报要素，则让 AI 直接根据编码+商品描述推断并生成常见要素（通用兜底）
    //    两路均返回 filledDeclarationElements，确保用户始终能看到申报建议
    let filledDeclarationElements = null;
    if (recNorm && recommendation) {
      try {
        const hsRecord = await hsCodeService.searchByHsCode(recNorm);
        const localElements =
          hsRecord && typeof hsRecord.declarationElements === 'string'
            ? hsRecord.declarationElements.split(/[|｜]/).map((e) => e.trim()).filter(Boolean)
            : [];

        let fillUserContent;
        if (localElements.length > 0) {
          // 7.1a 本地库有申报要素 → 按模板逐项填值
          fillUserContent = `产品描述：${keyword}\nHS编码：${recommendation.hsCode}\n商品名称：${recommendation.productName || ''}\n\n该编码的申报要素列表（请为每项填写申报值）：\n${localElements.map((e, i) => `${i + 1}. ${e}`).join('\n')}\n\n请为每个要素填写具体申报值：`;
        } else {
          // 7.1b 本地库无申报要素 → AI 自行推断该编码通常需要哪些要素并填值
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
只输出 JSON 数组，不要有其他文字：
[{"element":"要素名","value":"申报值","uncertain":false}]`,
          },
          {
            role: 'user',
            content: fillUserContent,
          },
        ];

        const fillResult = await aiService.callAI(fillMessages);

        // 7.2 记录申报要素填写的 Token 消耗
        if (userId && fillResult.tokenUsage) {
          try {
            await aiService.recordTokenUsage(
              userId,
              null,
              fillResult.model || aiService.MODELS.fast,
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

    success(res, {
      recommendation,
      rawResponse: result.content,
      candidates,
      filledDeclarationElements,
    });
  } catch (error) {
    next(error);
  }
  }
);

module.exports = router;
