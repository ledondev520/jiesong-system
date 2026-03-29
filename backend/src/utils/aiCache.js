/**
 * Input: 缓存文件路径、TTL 配置
 * Output: 内存 + 文件持久化的 AI 结果缓存工具
 * Pos: 工具层，为 AI 推荐接口提供透明缓存，节省 API 成本
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '../../data');
const CACHE_FILE = path.join(CACHE_DIR, 'hs-ai-cache.json');
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天
const MAX_ENTRIES = 2000;

/** @type {Map<string, { data: any, createdAt: number, hitCount: number }>} */
let cache = new Map();
let dirty = false;

/**
 * 职责：从磁盘加载缓存文件到内存
 * 思路：启动时调用一次，文件不存在或损坏时静默初始化空缓存
 */
function loadFromDisk() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
      const entries = JSON.parse(raw);
      if (Array.isArray(entries)) {
        cache = new Map(entries.map(([k, v]) => [k, v]));
      }
    }
  } catch {
    cache = new Map();
  }
}

/**
 * 职责：异步将内存缓存写入磁盘
 * 思路：仅在有变更(dirty)时写入，避免频繁 IO
 */
let saveTimer = null;
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
      const entries = [...cache.entries()];
      fs.writeFileSync(CACHE_FILE, JSON.stringify(entries, null, 0), 'utf-8');
    } catch (err) {
      console.error('[aiCache] 写入缓存文件失败:', err.message);
    }
  }, 2000);
}

/**
 * 职责：标准化缓存 key
 * @param {string} query - 用户原始查询文本
 * @returns {string}
 */
function normalizeKey(query) {
  return String(query || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * 职责：查询缓存（未过期则命中）
 * @param {string} query - 产品描述
 * @param {number} [ttlMs] - 过期时间（毫秒），默认 30 天
 * @returns {any|null} 缓存数据或 null
 */
function get(query, ttlMs = DEFAULT_TTL_MS) {
  const key = normalizeKey(query);
  if (!key) return null;

  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.createdAt > ttlMs) {
    cache.delete(key);
    scheduleSave();
    return null;
  }

  entry.hitCount = (entry.hitCount || 0) + 1;
  scheduleSave();
  return entry.data;
}

/**
 * 职责：写入缓存
 * @param {string} query - 产品描述
 * @param {any} data - AI 返回的完整结果
 */
function set(query, data) {
  const key = normalizeKey(query);
  if (!key) return;

  cache.set(key, {
    data,
    createdAt: Date.now(),
    hitCount: 0,
  });

  // LRU 淘汰：超出上限时移除最早的条目
  if (cache.size > MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }

  scheduleSave();
}

/**
 * 职责：移除指定查询的缓存
 * @param {string} query - 产品描述
 */
function remove(query) {
  const key = normalizeKey(query);
  if (!key) return;
  if (cache.has(key)) {
    cache.delete(key);
    scheduleSave();
  }
}

/**
 * 职责：模拟 AI 思考延迟，使缓存命中对用户透明
 * @returns {Promise<void>}
 */
function simulateDelay() {
  const delay = 400 + Math.random() * 600;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

loadFromDisk();

module.exports = { get, set, remove, simulateDelay };
