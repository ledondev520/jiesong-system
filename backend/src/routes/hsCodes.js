/**
 * Input: hsCodeService, aiService
 * Output: HSCode 查询路由（含 AI 推荐功能）
 * Pos: 提供本地 HSCode 搜索、详情、AI推荐接口
 */

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { roleAuth } = require('../middleware/roleAuth');
const hsCodeService = require('../services/hsCodeService');
const aiService = require('../services/aiService');
const { success } = require('../utils/response');
const { createError } = require('../middleware/errorHandler');

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
 * 1. 先用关键词模糊搜索候选 HS 码（最多 10 条）
 * 2. 将候选列表 + 产品描述发送给 AI，让它推荐最合适的 HS 码
 * 3. 返回 AI 推荐结果 + 候选列表
 */
router.post('/ai-recommend', authenticate, async (req, res, next) => {
  try {
    const { productDescription } = req.body;
    if (!productDescription || typeof productDescription !== 'string' || !productDescription.trim()) {
      throw createError('productDescription 不能为空', 400);
    }

    const keyword = productDescription.trim();

    // 1. 模糊搜索候选 HS 码（最多 10 条）
    const candidates = await hsCodeService.fuzzySearchHsCodes({
      keyword,
      page: '1',
      pageSize: '10',
    });

    const items = candidates.items || [];

    if (items.length === 0) {
      success(res, {
        recommendation: null,
        reason: '未找到匹配的 HS 码候选，请换用更精准的产品描述',
        candidates: [],
      });
      return;
    }

    // 2. 构建 AI Prompt
    const candidateText = items
      .map((c, i) => `${i + 1}. HS码: ${c.hsCode} | 商品名称: ${c.productName} | 税率: ${c.taxRate ?? '未知'}%`)
      .join('\n');

    const messages = [
      {
        role: 'system',
        content: `你是专业的跨境贸易HS编码专家，请根据用户提供的产品描述，从候选HS编码列表中选出最合适的一个。
只输出以下JSON格式，不要有任何其他文字：
{"hsCode":"编码","productName":"商品名称","reason":"推荐理由（2-3句话）"}`,
      },
      {
        role: 'user',
        content: `产品描述：${keyword}\n\n候选HS编码列表：\n${candidateText}\n\n请从以上候选中推荐最合适的HS编码。`,
      },
    ];

    const result = await aiService.callAI(messages);

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

    success(res, {
      recommendation,
      rawResponse: result.content,
      candidates: items,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
