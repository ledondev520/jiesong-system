/**
 * Input: HSCIQ API (https://www.hsciq.com/mcp)、config.hsciq（API Key + Base URL）
 * Output: 海关只读查询，含缓存、并发请求共享、配额预留、总超时与受控上游错误
 * Pos: 服务层，封装 HSCIQ 外部 API 调用，为 HS 编码推荐与申报要素提供权威数据源
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');
const { createError } = require('../middleware/errorHandler');

const BASE_URL = config.hsciq.baseUrl || 'https://www.hsciq.com/mcp';
const API_KEY = config.hsciq.apiKey || '';

const CACHE_DIR = path.join(__dirname, '../../data');
const CACHE_FILE = path.join(CACHE_DIR, 'hsciq-cache.json');
const DAILY_LIMIT = 150;
// HSCIQ_TIMEOUT_MS 可校准网络等待；总超时包含 DNS、连接及响应正文读取。
const REQUEST_TIMEOUT_MS = Math.min(Math.max(parseInt(process.env.HSCIQ_TIMEOUT_MS, 10) || 10000, 1000), 30000);

const CODE_DETAIL_TTL = 7 * 24 * 60 * 60 * 1000;   // 编码详情 7 天
const SEARCH_TTL = 3 * 24 * 60 * 60 * 1000;         // 搜索结果 3 天
const MAX_CACHE_ENTRIES = 3000;

/** @type {Map<string, { data: any, createdAt: number, ttl: number }>} */
let cache = new Map();
let dirty = false;
let saveTimer = null;

let dailyCallCount = 0;          // 今日已调用次数
let dailyCountDate = '';         // 对应日期 'YYYY-MM-DD'
let pendingCallCount = 0;
const pendingCalls = new Map();

/**
 * 职责：获取今天的日期字符串
 * @returns {string} 'YYYY-MM-DD'
 */
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 职责：重置每日计数（跨天自动清零）
 */
function ensureDailyReset() {
  const today = todayStr();
  if (dailyCountDate !== today) {
    dailyCallCount = 0;
    dailyCountDate = today;
  }
}

/**
 * 职责：检查是否还有可用的每日配额
 * @returns {boolean}
 */
function hasQuota() {
  ensureDailyReset();
  return dailyCallCount + pendingCallCount < DAILY_LIMIT;
}

/**
 * 职责：从磁盘加载缓存
 */
function loadFromDisk() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed.entries && Array.isArray(parsed.entries)) {
        cache = new Map(parsed.entries.map(([k, v]) => [k, v]));
      }
      if (parsed.dailyCount && parsed.dailyDate === todayStr()) {
        dailyCallCount = parsed.dailyCount;
        dailyCountDate = parsed.dailyDate;
      }
    }
  } catch {
    cache = new Map();
  }
}

/**
 * 职责：异步将缓存写入磁盘
 */
function scheduleSave() {
  if (saveTimer) return;
  dirty = true;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (!dirty) return;
    dirty = false;
    try {
      if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
      }
      ensureDailyReset();
      const payload = {
        entries: [...cache.entries()],
        dailyCount: dailyCallCount,
        dailyDate: dailyCountDate,
      };
      fs.writeFileSync(CACHE_FILE, JSON.stringify(payload, null, 0), 'utf-8');
    } catch (err) {
      console.error('[hsciqService] 写入缓存文件失败:', err.message);
    }
  }, 2000);
}

/**
 * 职责：从缓存读取
 * @param {string} key
 * @returns {any|null}
 */
function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > entry.ttl) {
    cache.delete(key);
    scheduleSave();
    return null;
  }
  return entry.data;
}

/**
 * 职责：写入缓存
 * @param {string} key
 * @param {any} data
 * @param {number} ttl
 */
function cacheSet(key, data, ttl) {
  cache.set(key, { data, createdAt: Date.now(), ttl });
  if (cache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  scheduleSave();
}

/**
 * 职责：调用 HSCIQ API（POST /mcp/tools/call）
 * 思路：
 *   1. 检查 API Key 是否配置
 *   2. 检查每日配额
 *   3. 发送 POST 请求，解析响应
 *   4. 递增每日计数
 * @param {string} toolName - 工具名（search_instance / search_code / search_unified / get_code_detail）
 * @param {object} args - 工具参数
 * @returns {Promise<any>} API 返回数据
 */
async function requestTool(toolName, args) {
  if (!API_KEY) {
    throw new Error('[hsciqService] HSCIQ_API_KEY 未配置');
  }
  if (!hasQuota()) {
    throw new Error(`[hsciqService] 今日 HSCIQ API 调用已达上限 (${DAILY_LIMIT}次)`);
  }

  const url = `${BASE_URL}/tools/call`;
  const body = JSON.stringify({ toolName, arguments: args });
  pendingCallCount++;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw createError(`HSCIQ 服务返回 ${response.status}`, response.status === 429 ? 503 : 502);
    }

    const result = await response.json();
    ensureDailyReset();
    dailyCallCount++;
    scheduleSave();

    if (result.ok === false) throw createError('HSCIQ 查询失败，请稍后重试', 502);
    return result.data ?? result;
  } catch (error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      throw createError('HSCIQ 请求超时，请稍后重试', 504);
    }
    if (error.statusCode) throw error;
    throw createError('HSCIQ 服务暂时不可用，请稍后重试', 502);
  } finally {
    pendingCallCount--;
  }
}

async function callTool(toolName, args) {
  const key = JSON.stringify([toolName, args]);
  if (pendingCalls.has(key)) return pendingCalls.get(key);
  const pending = requestTool(toolName, args);
  pendingCalls.set(key, pending);
  try {
    return await pending;
  } finally {
    pendingCalls.delete(key);
  }
}

/**
 * 职责：搜索归类实例（最高价值接口，提供真实海关归类案例）
 * @param {string} keywords - 商品关键词
 * @param {object} [opts]
 * @param {number} [opts.pageIndex=1]
 * @param {number} [opts.pageSize=10]
 * @returns {Promise<{ items: object[], totalItemCount: number }>}
 */
async function searchInstance(keywords, { pageIndex = 1, pageSize = 10 } = {}) {
  const cacheKey = `inst:${keywords}:${pageIndex}:${pageSize}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const data = await callTool('search_instance', {
    keywords,
    pageIndex,
    pageSize,
  });

  cacheSet(cacheKey, data, SEARCH_TTL);
  return data;
}

/**
 * 职责：搜索海关编码（支持中国/日本/美国）
 * @param {string} keywords - 商品关键词或编码
 * @param {object} [opts]
 * @param {string} [opts.country='CN']
 * @param {number} [opts.pageIndex=1]
 * @param {number} [opts.pageSize=10]
 * @param {boolean} [opts.filterFailureCode=true]
 * @returns {Promise<{ items: object[], totalItemCount: number }>}
 */
async function searchCode(keywords, { country = 'CN', pageIndex = 1, pageSize = 10, filterFailureCode = true } = {}) {
  const cacheKey = `code:${country}:${keywords}:${pageIndex}:${pageSize}:${filterFailureCode}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const data = await callTool('search_code', {
    keywords,
    country,
    pageIndex,
    pageSize,
    filterFailureCode,
  });

  cacheSet(cacheKey, data, SEARCH_TTL);
  return data;
}

/**
 * 职责：获取编码详情（税率、申报要素、监管条件等完整信息）
 * @param {string} code - HS 编码（如 '7308300000'）
 * @param {string} [country='CN']
 * @returns {Promise<object>} MCPCodeDetailResult
 */
async function getCodeDetail(code, country = 'CN') {
  const cacheKey = `detail:${country}:${code}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const data = await callTool('get_code_detail', { code, country });

  cacheSet(cacheKey, data, CODE_DETAIL_TTL);
  return data;
}

/**
 * 职责：统一搜索（CIQ 监管条件、危化品、港口）
 * @param {string} keywords
 * @param {object} [opts]
 * @param {string} [opts.unifiedType='ciq'] - 'ciq' | 'hazardous' | 'port'
 * @param {number} [opts.pageIndex=1]
 * @param {number} [opts.pageSize=10]
 * @returns {Promise<{ items: object[], totalItemCount: number }>}
 */
async function searchUnified(keywords, { unifiedType = 'ciq', pageIndex = 1, pageSize = 10 } = {}) {
  const cacheKey = `unified:${unifiedType}:${keywords}:${pageIndex}:${pageSize}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const data = await callTool('search_unified', {
    keywords,
    unifiedType,
    pageIndex,
    pageSize,
  });

  cacheSet(cacheKey, data, SEARCH_TTL);
  return data;
}

/**
 * 职责：判断 HSCIQ 服务是否可用（API Key 已配置）
 * @returns {boolean}
 */
function isAvailable() {
  return Boolean(API_KEY);
}

/**
 * 职责：获取今日 API 使用情况
 * @returns {{ used: number, limit: number, remaining: number }}
 */
function getUsageStats() {
  ensureDailyReset();
  return {
    used: dailyCallCount,
    limit: DAILY_LIMIT,
    remaining: Math.max(0, DAILY_LIMIT - dailyCallCount - pendingCallCount),
  };
}

loadFromDisk();

module.exports = {
  searchInstance,
  searchCode,
  getCodeDetail,
  searchUnified,
  isAvailable,
  hasQuota,
  getUsageStats,
};
