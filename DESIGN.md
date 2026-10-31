# 捷淞进销存系统 — 设计系统文档

> 本文档由 `/plan-design-review` 从代码库提取生成，是设计决策的单一事实源。
> 修改设计 Token 或组件规范时，请同步更新本文件。

---

## 设计哲学

- **精准胜于精美**：每个 UI 决策须能被解释，而非"感觉好看"。
- **减法默认**：不能说明用途的 UI 元素不上线。
- **信任来自像素级的一致性**：设计一致性是企业软件可信度的基础。

---

## 色彩系统

Token 单一来源：`frontend/src/app/globals.css`（`:root` 与 `.dark`）。依据 `docs/redesign/UX-REDESIGN-2026.md` §8.3。

### 中性色（shadcn zinc）
`--background` / `--card` / `--secondary` / `--muted` / `--accent` / `--border` / `--input` / `--sidebar*` 均取自 zinc 色阶（色相 ≈ 286，近乎无彩），不再带绿色底色。

### 主色（唯一品牌强调色：深青绿）
| Token | 浅色 | 深色 | 用途 |
|---|---|---|---|
| `--primary` / `--ring` / `--sidebar-primary` | `oklch(0.5 0.11 165)` | `oklch(0.62 0.12 165)` | 仅用于主按钮、链接、当前导航项 |
| `--primary-foreground` | `oklch(0.985 0 0)` | `oklch(0.141 0.005 285.823)` | 主色背景上的文字 |

### 语义色
- `--destructive`：删除/错误（红色仅用于阻塞、逾期、破坏性操作）
- `--muted` / `--muted-foreground`：辅助信息
- `--border`、`--card` / `--card-foreground`：边框与卡片

### 状态徽章色（§8.7）
Tailwind 工具类：`text-status-<色>` / `bg-status-<色>-soft`（`gray|blue|amber|green|red`）。`:root` 与 `.dark` 各有一套，文字对比度 ≥ 4.5:1。

| 色 | 含义 | 典型状态 |
|---|---|---|
| gray | 草稿 / 停用 | 草稿、已取消、已拒绝、已出库 |
| blue | 进行中 | 已确认、生产中、包装中、运输中 |
| amber | 等待他人 / 需处理 | 已到港、待装柜、已过期 |
| green | 已完成 | 已入库、已收货、已完成 |
| red | 阻塞 / 逾期 / 破坏性 | 仅此类场景 |

状态 → 颜色的映射由后续 PR 合并 `status-badge.tsx` 与 `semantic-badge.tsx` 时落地；本次只提供 token。

---

## 字体系统

定义于 `frontend/src/app/layout.tsx` fontVariables：

| 变量 | 字体栈 | 用途 |
|---|---|---|
| `--font-body-sans` | PingFang SC, Hiragino Sans GB, Microsoft YaHei, Source Han Sans SC | 正文（全局默认） |
| `--font-display-serif` | Songti SC, STSong, Noto Serif CJK SC | 标题展示（大号数字/金额） |
| `--font-ui-mono` | IBM Plex Mono, SFMono-Regular, Menlo | 代码、合同号、SKU、单据号（EXP…、CG…、QT…） |

> 重设计方向（§8.2）：不再用衬线体显示数字；`--font-display-serif` 保留但新页面不使用。

### 字号阶梯
12 / 13 / 14（正文）/ 16 / 20 / 24 px。对应 Tailwind `text-xs` / **`text-13`（新增，表格用）** / `text-sm` / `text-base` / `text-xl` / `text-2xl`。`text-13` 通过 `@theme` 的 `--text-13` 提供，不覆盖 Tailwind 默认字号。

### 数字
`globals.css` 对 `td`、`th` 与 `.tabular-nums` 设置 `font-variant-numeric: tabular-nums`，金额/数量列对齐；表格内数字右对齐由表格组件负责。

---

## 组件规范

### 自定义工具类（`globals.css` @layer components）

| 类名 | 等效样式 | 用途 |
|---|---|---|
| `.surface-panel` | `rounded-xl border border-border bg-card shadow-sm` | 通用内容面板（表格、列表容器） |
| `.kpi-card` | `surface-panel + hover:bg-accent/35 transition-colors` | KPI 数据卡片 |
| `.surface-mesh` | 渐变背景纹理 | 页面背景装饰 |
| `.auth-shell` | 登录页全屏容器 + 网格背景 | 认证页面布局 |

### 核心 shadcn/ui 组件

| 组件 | 使用规范 |
|---|---|
| `Card` / `CardHeader` / `CardContent` | 业务内容块，`CardHeader` 必须包含 `CardTitle` |
| `Table` | 包裹于 `.surface-panel` 容器内 |
| `Badge` | 状态标签，配合 `StatusBadge` 封装 |
| `Button` | `variant="outline"` 为次要操作，`variant="default"` 为主操作 |
| `Sheet` | 移动端侧滑导航 |
| `Dialog` | 确认弹窗 |
| `Tabs` / `TabsList` / `TabsTrigger` | 页面内内容切换（非路由切换） |
| `Toast` (sonner) | `position="top-center"`，正面反馈用 `toast.success`，错误用 `toast.error` |

---

## 导航架构

系统采用 **两级导航**：

```
Level 1：Sidebar（6个模块入口）
  - 经营中台  → /dashboard
  - 采购      → /dashboard/contracts
  - 出口      → /dashboard/sales
  - 财务      → /dashboard/finance/statements
  - AI 助手   → /dashboard/ai/sessions
  - 系统管理  → /dashboard/settings

Level 2：ModuleTabHeader（模块内水平 Tab，切换路由）
  - 经营中台: 工作台 | 经营执行 | 库存状态
  - 采购:     采购合同 | 供应商管理
  - 出口:     出口合同 | 出口退税 | 报关单 | HS 编码
  - 财务:     财务报表 | 收付管理
  - AI:       AI 会话
  - 系统管理: 系统配置 | 用户管理 | 通知中心 | 系统日志 | 导入记录 | 合同模板
```

**规则**：
- 页面内容切换用 shadcn `Tabs`（不触发路由跳转）
- 路由级跳转用 `ModuleTabHeader`
- 禁止在同一页面同时使用 `ModuleTabHeader` + 页面内 `Tabs` 超过一层（避免3级导航）

### 移动端导航
- `md` 以下 Sidebar 隐藏，通过 Header 的汉堡菜单（`Sheet`）展开导航
- 移动端导航数据与 Sidebar 保持完全一致（`mobileNavItems` = Sidebar `moduleNavItems` 镜像）

---

## 交互状态规范

每个数据加载区块必须实现：

| 状态 | 实现方式 |
|---|---|
| Loading | `Loader2` 旋转图标 + 文字 "加载中..." |
| Empty | `EmptyState` 组件 或 icon + 说明文字 + 主操作按钮（若可操作） |
| Error | `toast.error()` + 持久错误 banner（数据缺失场景需显示 `ServerCrash` 图标） |
| Partial | 骨架屏（`animate-pulse` + `bg-muted`） |

### 空状态规范
- 使用 `frontend/src/components/ui/empty-state.tsx` 组件
- 必须包含：图标、标题、说明文字
- 可操作时必须包含：主要操作按钮

---

## 间距与布局

- 页面内容区：`space-y-6`（各区块间距）
- 卡片内部：`CardHeader pb-4` + `CardContent`
- 表格行高：`py-3`（`TableHead` / `TableCell`）
- 圆角：`--radius: 0.375rem`（6px）。`rounded-lg` = 6px，`rounded-md` = 4px，`rounded-sm` = 2px，`rounded-xl` = 10px；不使用胶囊形状。已有 `rounded-2xl` 的卡片类（`.surface-panel`、`.kpi-card`、`.auth-card`）与 `.status-badge` 的 `rounded-full` 随后续页面 PR 逐步收敛，本次不改
- 4/8 px 间距网格；表格行 36px（紧凑），表单控件 36px，按钮 32/36px（后续组件 PR 落地）
- 以边框代替阴影；阴影只用于弹层与对话框
- 触摸目标最小尺寸：`h-11`（44px）

---

## 无障碍规范

- icon-only 按钮必须有 `aria-label`
- 表单控件必须有对应 `aria-label` 或关联 `<label>`
- 触摸目标 ≥ 44px（`h-11 w-11` 或更大）
- 颜色对比度遵循 WCAG AA

---

## 不在范围内的设计决策

- PDF 导出排版（不可靠，Markdown 导出优先）
- 图表配色方案（使用 recharts 默认 + primary 色）
- 打印样式

---

*最后更新：2026-10-31（设计 Token：UX 重设计 §8.2–8.4/8.7）*
