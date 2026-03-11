# HSCode Live Raw Capture Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 从 `hsbianma.com` 抓取当前可访问的 HSCode 原始详情信息，先完成本地原始数据快照，不先做清洗入库。

**Architecture:** 通过章节关键字搜索页（`01`-`99`）枚举 10 位编码，再逐条抓取详情页并解析成结构化 JSON。输出以“每编码一个 JSON + 全局 manifest + 章节分页快照”的方式落盘，天然支持断点续跑与后续清洗。

**Tech Stack:** Python 3、requests、BeautifulSoup4、lxml

---

### Task 1: 站点结构验证与测试先行

**Files:**
- Create: `backend/scripts/test_scrape_hscode_raw.py`
- Test: `python3 -m unittest backend/scripts/test_scrape_hscode_raw.py`

**Step 1: 写失败测试**

- 覆盖搜索页提取 10 位编码去重。
- 覆盖详情页解析基本信息、税率、申报要素、监管条件、检验检疫、协定税率、RCEP、所属章节、CIQ。

**Step 2: 运行红灯**

Run: `python3 -m unittest backend/scripts/test_scrape_hscode_raw.py`

Expected: 先因抓取模块缺失失败。

### Task 2: 实现可续跑抓取器

**Files:**
- Create: `backend/scripts/scrape_hscode_raw.py`
- Output: `backend/data/hscode-live/**/*`

**Step 1: 实现搜索页枚举**

- 输入章节号，循环抓 `Search/<page>?keywords=<chapter>`。
- 提取并去重 10 位详情页编码。

**Step 2: 实现详情页解析**

- 将可见段落完整解析为结构化 JSON。
- 每个编码单独写到 `records/<code>.json`。

**Step 3: 实现断点续跑**

- 已存在的 `records/<code>.json` 自动跳过。
- 每章产出 `chapters/<chapter>.json`，全局产出 `manifest.json`。

### Task 3: 执行真实抓取并留痕

**Files:**
- Modify: `PLAN.md`
- Modify: `TASKS.md`
- Modify: `RISKS.md`
- Modify: `METRICS.md`
- Create: `logs/task-HSCODE-RAW-01.md`
- Create: `RESULTS/HSCODE-RAW-01.md`
- Create: `PATCHES/HSCODE-RAW-01.diff`

**Step 1: 真实运行**

Run: `python3 backend/scripts/scrape_hscode_raw.py --request-delay 0.03 --workers 4`

**Step 2: 记录阶段结果**

- 已抓取记录数
- 已完成章节
- 失败数与可恢复方式
