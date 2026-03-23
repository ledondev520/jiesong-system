# Frontend Next Iterations

更新时间：`2026-03-22`

## 目标

把当前“已恢复可演进基线”的前端，继续推进到：

- 壳层稳定
- 模块结构清晰
- 首页层级明确
- 超大页面逐步解耦
- 视觉和交互一致性真正落地

## 当前已完成

- 前端 `lint` 通过
- 前端 `build` 通过
- 导航配置已收口到单一注册表
- 旧 `dashboard/logs` 壳层页已清理
- 审查结论与 checkpoint 已落盘

## 剩余迭代项

## P0

### 1. 工作台首屏重做

- 任务 ID：`FE-DASH-01`
- 目标：
  - 把当前“卡片拼盘”改成真正的工作空间首页
  - 首屏只保留最重要的 4 类信息：
    - 当前焦点
    - 高频动作
    - 风险提醒
    - 关键趋势
- 输出文件：
  - `frontend/src/app/dashboard/page.tsx`
  - `frontend/src/components/dashboard/DataDashboard.tsx`
  - 相关测试文件

### 2. 导航注册表继续深化

- 任务 ID：`FE-NAV-02`
- 目标：
  - 把模块权限、默认落点、重定向策略也并入导航注册表
  - 减少 `Header` / `Sidebar` / layout 内的条件分支
- 输出文件：
  - `frontend/src/components/layout/navigation.config.ts`
  - `frontend/src/app/dashboard/layout.tsx`
  - 相关测试文件

## P1

### 3. 拆分财务报表大页面

- 任务 ID：`FE-SPLIT-01`
- 优先级原因：
  - `finance/statements/page.tsx` 体量最大，后续最难维护
- 目标：
  - 拆成 route page / data container / chart sections / dialogs
  - 保持行为不变，先做结构拆分
- 输出文件：
  - `frontend/src/app/dashboard/finance/statements/page.tsx`
  - 新增同目录或子目录组件

### 4. 拆分采购建议页

- 任务 ID：`FE-SPLIT-02`
- 优先级原因：
  - 页面接近 900 行，且视觉负担重
- 目标：
  - 先拆结构，再决定是否继续做功能收缩
  - 降低重复 `Card/Table` 堆叠感
- 输出文件：
  - `frontend/src/app/dashboard/store-recommend/page.tsx`
  - 新增子组件

### 5. 重构 Header

- 任务 ID：`FE-SHELL-01`
- 目标：
  - 把移动端导航、全局搜索、通知、用户菜单进一步解耦
  - 降低 Header 成为“超重基础组件”的风险
- 输出文件：
  - `frontend/src/components/layout/Header.tsx`
  - 新增 Header 子组件

### 6. 全局搜索改为聚合入口

- 任务 ID：`FE-SEARCH-01`
- 目标：
  - 避免每次输入并发打 5 个接口
  - 收敛为后端聚合搜索或前端统一搜索服务
- 输出文件：
  - `frontend/src/components/layout/Header.tsx`
  - `frontend/src/services/*`
  - 若需要则补后端接口

## P2

### 7. AI 助手交互降噪

- 任务 ID：`FE-AI-01`
- 目标：
  - 让 AI 助手从“全局抢焦点的悬浮物”改成更克制的辅助工具
  - 优先考虑：
    - 可收纳侧边面板
    - 模块内上下文入口
    - 更弱存在感的触发方式
- 输出文件：
  - `frontend/src/components/ai/LazyAIAssistantMount.tsx`
  - `frontend/src/components/ai/AIAssistant.tsx`

### 8. 空态体系统一

- 任务 ID：`FE-STATE-01`
- 目标：
  - 列表页、图表页、模块页统一 loading / empty / error 呈现
  - 继续减少“每页自己写一套空态”的情况
- 输出文件：
  - `frontend/src/components/ui/empty-state.tsx`
  - 相关业务页

### 9. 模块首页差异化

- 任务 ID：`FE-MODULE-01`
- 目标：
  - 采购、出口、财务三个模块首页不再只是“同模板不同标题”
  - 每个模块形成自己的首屏信息结构
- 优先顺序：
  - 财务
  - 采购
  - 出口

### 10. 截图回归门禁

- 任务 ID：`FE-QA-01`
- 目标：
  - 给登录页、工作台、采购合同、财务页、移动端首屏补截图回归
  - 防止后续视觉结构继续漂移

## 推荐执行顺序

1. `FE-DASH-01`
2. `FE-NAV-02`
3. `FE-SPLIT-01`
4. `FE-SPLIT-02`
5. `FE-SHELL-01`
6. `FE-SEARCH-01`
7. `FE-AI-01`
8. `FE-STATE-01`
9. `FE-MODULE-01`
10. `FE-QA-01`

## 进入下一轮前的约束

- 每轮改动后继续保持：
  - `cd frontend && npm run lint`
  - `cd frontend && npm run build`
- 触及壳层或导航时，必须补对应定向测试
- 触及首页或模块页视觉结构时，必须补截图或至少补页面级验证说明
