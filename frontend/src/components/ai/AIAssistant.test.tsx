/**
 * Input: AIAssistant组件、fetch/aiService mock
 * Output: AI统一助手组件交互测试结果（流式+图片+二步确认）
 * Pos: 全局AI助手组件测试
 */

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAuthStore } from "@/store/auth.store";
import { Role, type User } from "@/types";
import {
  AIAssistant,
  stripPageContext,
  toSafeDashboardPath,
  withPageContext,
} from "./AIAssistant";

const OriginalFileReader = globalThis.FileReader;
const mockExecuteAgentAction = vi.fn();
const mockCancelAgentAction = vi.fn();
const mockGetSessions = vi.fn();
const mockGetChatHistory = vi.fn();

const mockClearApiGetCache = vi.fn();
const mockClearAllCache = vi.fn();
vi.mock("@/lib/axios", () => ({
  clearApiGetCache: () => mockClearApiGetCache(),
}));
vi.mock("@/lib/api-cache", () => ({
  clearAllCache: () => mockClearAllCache(),
}));

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/services/ai.service", () => ({
  aiService: {
    executeAgentAction: (...args: unknown[]) => mockExecuteAgentAction(...args),
    cancelAgentAction: (...args: unknown[]) => mockCancelAgentAction(...args),
    getSessions: (...args: unknown[]) => mockGetSessions(...args),
    getChatHistory: (...args: unknown[]) => mockGetChatHistory(...args),
  },
}));

function createMockFileReader() {
  return class MockFileReader {
    onload: ((event: { target: { result: string } }) => void) | null = null;
    readAsDataURL() {
      this.onload?.({ target: { result: "data:image/png;base64,mocked" } });
    }
  };
}

/**
 * 职责：构造可控的 SSE 流式响应 reader
 * @param chunks SSE 事件文本数组
 */
function createMockSseReader(chunks: string[]) {
  const encodedChunks = chunks.map((chunk) => new TextEncoder().encode(chunk));
  let index = 0;
  return {
    read: vi.fn().mockImplementation(async () => {
      if (index >= encodedChunks.length) {
        return { done: true, value: undefined };
      }
      const value = encodedChunks[index];
      index += 1;
      return { done: false, value };
    }),
  };
}

describe("AIAssistant", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.FileReader =
      createMockFileReader() as unknown as typeof FileReader;
    mockExecuteAgentAction.mockReset();
    mockCancelAgentAction.mockReset();
    mockClearApiGetCache.mockReset();
    mockClearAllCache.mockReset();
  });

  afterAll(() => {
    globalThis.FileReader = OriginalFileReader;
  });

  it("只放行站内 /dashboard/ 路径", () => {
    expect(toSafeDashboardPath("/dashboard/sales/EXP1?tab=a&b=1#x")).toBe(
      "/dashboard/sales/EXP1?tab=a&b=1#x",
    );
    for (const bad of [
      "//evil.com/dashboard/x",
      "https://evil.com/dashboard/x",
      "javascript:alert(1)",
      "/dashboard/x\\evil",
      '/dashboard/x"onmouseover=1',
      "/dashboard/<script>",
      "/other/dashboard/x",
      "/dashboard/../api/v1/auth/logout",
      "/dashboard/%2e%2e/api/v1/auth/logout",
      "/dashboard/.%2E/api/v1/auth/logout",
    ]) {
      expect(toSafeDashboardPath(bad)).toBeNull();
    }
  });

  it("点击 AI 回复里的 /dashboard 链接用路由跳转，外链不成链接", async () => {
    mockPush.mockReset();
    const reader = createMockSseReader([
      'data: {"type":"chunk","content":"见 /dashboard/sales/EXP1。另有 https://evil.com/x"}\n\n',
      'data: {"type":"done","model":"kimi","pendingActions":[]}\n\n',
    ]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      body: { getReader: () => reader },
    } as unknown as Response);

    const user = userEvent.setup();
    render(<AIAssistant />);
    await user.click(screen.getByRole("button", { name: "AI 助手" }));
    await user.type(
      screen.getByPlaceholderText("输入问题或粘贴图片..."),
      "订单",
    );
    await user.keyboard("{Enter}");

    const link = await screen.findByRole("link", { name: "点击查看详情" });
    expect(link).toHaveAttribute("href", "/dashboard/sales/EXP1");
    await user.click(link);
    expect(mockPush).toHaveBeenCalledWith("/dashboard/sales/EXP1");
    expect(screen.getAllByRole("link", { name: "点击查看详情" })).toHaveLength(
      1,
    );
  });

  it("点击低存在感触发器后打开侧边面板", async () => {
    const user = userEvent.setup();
    render(<AIAssistant />);

    await user.click(screen.getByRole("button", { name: "AI 助手" }));
    expect(
      screen.getByRole("complementary", { name: "AI 助手侧边面板" }),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("complementary", { name: "AI 助手侧边面板" }),
      ).getByText("AI 助手"),
    ).toBeInTheDocument();
  });

  it("开场白如实说明能做什么：不声称能改汇率/系统配置，写明付款等需确认 (B42)", () => {
    render(<AIAssistant presentation="docked" onClose={() => {}} />);
    const panel = screen.getByRole("complementary", { name: "AI 助手面板" });
    expect(panel).toHaveTextContent("起草采购单、报关单、核销和退税草稿");
    expect(panel).toHaveTextContent("异常处理的操作，会先请你确认后才执行");
    expect(panel).toHaveTextContent("汇率和报价参数不能在这里修改");
    expect(panel).not.toHaveTextContent(
      "可以帮你查财务数据、出口合同、修改汇率",
    );
  });

  it("停靠模式填满宿主、没有悬浮触发器，关闭交给宿主", async () => {
    const onClose = vi.fn();
    render(<AIAssistant presentation="docked" onClose={onClose} />);

    expect(
      screen.queryByRole("button", { name: "AI 助手" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "AI 助手面板" }),
    ).toHaveClass("h-full", "w-full");
    expect(screen.getByRole("button", { name: "新建对话" })).toBeVisible();
    expect(screen.getByRole("button", { name: "历史对话" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "收起AI助手" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("页面上下文只含路由与记录 id，并附在提问前", () => {
    expect(withPageContext("这个订单还缺什么？")).toBe("这个订单还缺什么？");
    expect(
      withPageContext("这个订单还缺什么？", {
        route: "/dashboard/sales/EXP260012",
        recordId: "EXP260012",
      }),
    ).toBe(
      "【当前页面：/dashboard/sales/EXP260012，记录 ID：EXP260012】\n这个订单还缺什么？",
    );
    expect(withPageContext("你好", { route: "/dashboard/finance" })).toBe(
      "【当前页面：/dashboard/finance】\n你好",
    );
  });

  it("恢复历史时去掉页面上下文行，只显示用户原文", () => {
    const sent = withPageContext("这个订单还缺什么？", {
      route: "/dashboard/sales/EXP260012",
      recordId: "EXP260012",
    });
    expect(stripPageContext(sent)).toBe("这个订单还缺什么？");
    expect(stripPageContext("普通问题")).toBe("普通问题");
    expect(stripPageContext("我想问【当前页面：x】\n是什么")).toBe(
      "我想问【当前页面：x】\n是什么",
    );
  });

  it("历史对话恢复时用户消息不带页面上下文前缀", async () => {
    mockGetSessions.mockResolvedValue({
      data: [{ sessionId: "s-1", preview: "这个订单还缺什么？" }],
    });
    mockGetChatHistory.mockResolvedValue({
      data: [
        {
          id: "h-1",
          role: "user",
          content:
            "【当前页面：/dashboard/sales/EXP260012，记录 ID：EXP260012】\n这个订单还缺什么？",
          createdAt: "2026-10-31T00:00:00.000Z",
        },
        {
          id: "h-2",
          role: "assistant",
          content: "还缺装箱单。",
          createdAt: "2026-10-31T00:00:01.000Z",
        },
      ],
    });
    const user = userEvent.setup();
    render(<AIAssistant presentation="docked" />);

    await user.click(screen.getByRole("button", { name: "历史对话" }));
    await user.click(
      await screen.findByRole("button", { name: /这个订单还缺什么/ }),
    );

    expect(await screen.findByText("还缺装箱单。")).toBeInTheDocument();
    expect(screen.queryByText(/当前页面/)).not.toBeInTheDocument();
    expect(screen.getAllByText("这个订单还缺什么？").length).toBeGreaterThan(0);
  });

  it("工作区模式直接展示完整对话面板且不渲染悬浮触发器", async () => {
    render(<AIAssistant presentation="workspace" />);

    expect(
      screen.queryByRole("button", { name: "AI 助手" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "AI 助手工作区" }),
    ).toHaveClass("min-h-[420px]");
    expect(screen.getByPlaceholderText("输入问题或粘贴图片...")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "收起AI助手" }),
    ).not.toBeInTheDocument();
  });

  it("流式发送消息显示逐步内容", async () => {
    const reader = createMockSseReader([
      'data: {"type":"session","sessionId":"unified_1"}\n\n',
      'data: {"type":"chunk","content":"当前"}\n\n',
      'data: {"type":"chunk","content":"汇率为"}\n\n',
      'data: {"type":"chunk","content":"6.84"}\n\n',
      'data: {"type":"done","model":"kimi","pendingActions":[]}\n\n',
    ]);

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      body: { getReader: () => reader },
    } as unknown as Response);

    const user = userEvent.setup();
    render(<AIAssistant />);

    await user.click(screen.getByRole("button", { name: "AI 助手" }));
    await user.type(
      screen.getByPlaceholderText("输入问题或粘贴图片..."),
      "汇率多少？",
    );
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByText("当前汇率为6.84")).toBeInTheDocument();
    });
  });

  it("模型未产生 partial chunk 时使用 done 事件中的最终文本", async () => {
    const reader = createMockSseReader([
      'data: {"type":"session","sessionId":"unified_done_only"}\n\n',
      'data: {"type":"done","content":"5","model":"moonshot-v1-8k","pendingActions":[]}\n\n',
    ]);

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      body: { getReader: () => reader },
    } as unknown as Response);

    const user = userEvent.setup();
    render(<AIAssistant />);

    await user.click(screen.getByRole("button", { name: "AI 助手" }));
    await user.type(
      screen.getByPlaceholderText("输入问题或粘贴图片..."),
      "2+3？",
    );
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByText("5")).toBeInTheDocument();
      expect(
        screen.queryByText("抱歉，AI 助手没有返回有效结果。"),
      ).not.toBeInTheDocument();
    });
  });

  it("发送失败时显示错误提示消息", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("Failed to fetch"),
    );

    const user = userEvent.setup();
    render(<AIAssistant />);

    await user.click(screen.getByRole("button", { name: "AI 助手" }));
    await user.type(
      screen.getByPlaceholderText("输入问题或粘贴图片..."),
      "你好",
    );
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(
        screen.getByText("无法连接到服务器，请检查网络连接。"),
      ).toBeInTheDocument();
    });
  });

  it("返回 pendingActions 时显示确认卡片", async () => {
    const reader = createMockSseReader([
      'data: {"type":"session","sessionId":"unified_2"}\n\n',
      'data: {"type":"chunk","content":"好的，修改汇率。"}\n\n',
      `data: ${JSON.stringify({
        type: "done",
        model: "kimi",
        pendingActions: [
          {
            actionId: "pa_1",
            actionType: "UpdateSystemConfig",
            description: "将汇率修改为 6.84",
            params: { key: "exchangeRate", value: "6.84" },
          },
        ],
      })}\n\n`,
    ]);

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      body: { getReader: () => reader },
    } as unknown as Response);

    const user = userEvent.setup();
    render(<AIAssistant />);

    await user.click(screen.getByRole("button", { name: "AI 助手" }));
    await user.type(
      screen.getByPlaceholderText("输入问题或粘贴图片..."),
      "改汇率",
    );
    await user.click(screen.getByRole("button", { name: "发送消息" }));

    await waitFor(() => {
      expect(screen.getByText(/将汇率修改为 6\.84/)).toBeInTheDocument();
      expect(screen.getByText("确认执行")).toBeInTheDocument();
      expect(screen.getByText("取消")).toBeInTheDocument();
    });
  });

  it("确认 pendingAction 后调用 executeAgentAction", async () => {
    const reader = createMockSseReader([
      'data: {"type":"session","sessionId":"u3"}\n\n',
      'data: {"type":"chunk","content":"修改。"}\n\n',
      `data: ${JSON.stringify({
        type: "done",
        model: "kimi",
        pendingActions: [
          {
            actionId: "pa_e1",
            actionType: "UpdateSystemConfig",
            description: "修改汇率",
            params: {},
          },
        ],
      })}\n\n`,
    ]);

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      body: { getReader: () => reader },
    } as unknown as Response);
    mockExecuteAgentAction.mockResolvedValue({
      data: { actionId: "pa_e1", success: true, detail: "已更新" },
    });

    const user = userEvent.setup();
    render(<AIAssistant />);

    await user.click(screen.getByRole("button", { name: "AI 助手" }));
    await user.type(screen.getByPlaceholderText("输入问题或粘贴图片..."), "改");
    await user.click(screen.getByRole("button", { name: "发送消息" }));

    await waitFor(() =>
      expect(screen.getByText("确认执行")).toBeInTheDocument(),
    );
    await user.click(screen.getByText("确认执行"));

    await waitFor(() => {
      expect(mockExecuteAgentAction).toHaveBeenCalledWith("pa_e1");
    });
  });

  const pendingActionStream = () =>
    createMockSseReader([
      'data: {"type":"session","sessionId":"c1"}\n\n',
      `data: ${JSON.stringify({
        type: "done",
        model: "kimi",
        pendingActions: [
          {
            actionId: "pa_c1",
            actionType: "CreatePurchase",
            description: "采购草稿",
            params: {},
          },
        ],
      })}\n\n`,
    ]);

  const sendOne = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("button", { name: "AI 助手" }));
    await user.type(screen.getByPlaceholderText("输入问题或粘贴图片..."), "改");
    await user.click(screen.getByRole("button", { name: "发送消息" }));
  };

  it("SSE done 与确认执行成功后都清空 API GET 缓存和页面缓存", async () => {
    const reader = pendingActionStream();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      body: { getReader: () => reader },
    } as unknown as Response);
    mockExecuteAgentAction.mockResolvedValue({ data: { detail: "ok" } });

    const user = userEvent.setup();
    render(<AIAssistant />);
    await sendOne(user);
    await screen.findByText("确认执行");
    expect(mockClearApiGetCache).toHaveBeenCalledTimes(1);
    expect(mockClearAllCache).toHaveBeenCalledTimes(1);

    await user.click(screen.getByText("确认执行"));
    await waitFor(() => expect(mockClearApiGetCache).toHaveBeenCalledTimes(2));
    expect(mockClearAllCache).toHaveBeenCalledTimes(2);
  });

  it("确认执行在重渲染前连点两次也只调用一次 executeAgentAction", async () => {
    const reader = pendingActionStream();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      body: { getReader: () => reader },
    } as unknown as Response);
    mockExecuteAgentAction.mockReturnValue(new Promise(() => {}));

    const user = userEvent.setup();
    render(<AIAssistant />);
    await sendOne(user);
    const confirm = await screen.findByText("确认执行");
    // 同一 act 内两次点击：React 尚未重渲染，按钮仍在，只能靠同步 ref 拦截。
    act(() => {
      confirm.click();
      confirm.click();
    });
    expect(mockExecuteAgentAction).toHaveBeenCalledTimes(1);
  });

  it("停用角色（OD-8，如 BOSS）只读，看不到确认执行按钮", async () => {
    useAuthStore.setState({ user: { role: "BOSS" } as unknown as User });
    const reader = pendingActionStream();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      body: { getReader: () => reader },
    } as unknown as Response);

    const user = userEvent.setup();
    render(<AIAssistant />);
    await sendOne(user);
    await screen.findByText("采购草稿");
    expect(screen.queryByText("确认执行")).not.toBeInTheDocument();
    useAuthStore.setState({ user: null });
  });

  it("卸载时中止进行中的 SSE 请求", async () => {
    let signal: AbortSignal | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      signal = init?.signal as AbortSignal;
      return {
        ok: true,
        body: { getReader: () => ({ read: () => new Promise(() => {}) }) },
      } as unknown as Response;
    });

    const user = userEvent.setup();
    const { unmount } = render(<AIAssistant />);
    await sendOne(user);
    await waitFor(() => expect(signal).toBeDefined());
    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
  });

  it("done 事件返回 actionRecommendations 时展示诊断建议", async () => {
    const reader = createMockSseReader([
      'data: {"type":"session","sessionId":"u5"}\n\n',
      'data: {"type":"chunk","content":"已完成诊断。"}\n\n',
      `data: ${JSON.stringify({
        type: "done",
        model: "kimi",
        pendingActions: [],
        actionRecommendations: [
          {
            code: "trade-compliance.create-tax-refund-record",
            title: "补建退税草稿",
            domain: "trade-compliance",
            priority: "medium",
            executionMode: "confirmable_write",
            reason: "退税链路尚未落单，需补退税记录",
          },
        ],
      })}\n\n`,
    ]);

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      body: { getReader: () => reader },
    } as unknown as Response);

    const user = userEvent.setup();
    render(<AIAssistant />);

    await user.click(screen.getByRole("button", { name: "AI 助手" }));
    await user.type(
      screen.getByPlaceholderText("输入问题或粘贴图片..."),
      "检查退税链路",
    );
    await user.click(screen.getByRole("button", { name: "发送消息" }));

    await waitFor(() => {
      expect(screen.getByText("诊断建议")).toBeInTheDocument();
      expect(screen.getByText("补建退税草稿")).toBeInTheDocument();
      expect(screen.getByText("可确认执行")).toBeInTheDocument();
    });
  });

  it("取消 pendingAction 后调用 cancelAgentAction", async () => {
    const reader = createMockSseReader([
      'data: {"type":"session","sessionId":"u4"}\n\n',
      'data: {"type":"chunk","content":"修改。"}\n\n',
      `data: ${JSON.stringify({
        type: "done",
        model: "kimi",
        pendingActions: [
          {
            actionId: "pa_c1",
            actionType: "UpdateSystemConfig",
            description: "修改",
            params: {},
          },
        ],
      })}\n\n`,
    ]);

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      body: { getReader: () => reader },
    } as unknown as Response);
    mockCancelAgentAction.mockResolvedValue({
      data: { actionId: "pa_c1", success: true, detail: "已取消" },
    });

    const user = userEvent.setup();
    render(<AIAssistant />);

    await user.click(screen.getByRole("button", { name: "AI 助手" }));
    await user.type(screen.getByPlaceholderText("输入问题或粘贴图片..."), "改");
    await user.click(screen.getByRole("button", { name: "发送消息" }));

    await waitFor(() => expect(screen.getByText("取消")).toBeInTheDocument());
    await user.click(screen.getByText("取消"));

    await waitFor(() => {
      expect(mockCancelAgentAction).toHaveBeenCalledWith("pa_c1");
    });
  });

  it("上传图片后展示待发送预览并可清除", async () => {
    const user = userEvent.setup();
    render(<AIAssistant />);

    await user.click(screen.getByRole("button", { name: "AI 助手" }));
    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const image = new File(["img"], "test.png", { type: "image/png" });
    await user.upload(fileInput, image);

    expect(screen.getByText("图片已准备好")).toBeInTheDocument();

    const previewText = screen.getByText("图片已准备好");
    const previewContainer = previewText.closest("div");
    const clearButton = previewContainer?.querySelector("button");
    expect(clearButton).toBeTruthy();
    await user.click(clearButton as HTMLButtonElement);
    expect(screen.queryByText("图片已准备好")).not.toBeInTheDocument();
  });

  it("在输入框粘贴图片时会生成待发送预览", async () => {
    const user = userEvent.setup();
    render(<AIAssistant />);

    await user.click(screen.getByRole("button", { name: "AI 助手" }));
    const input = screen.getByPlaceholderText("输入问题或粘贴图片...");
    const image = new File(["img"], "paste.png", { type: "image/png" });

    fireEvent.paste(input, {
      clipboardData: {
        items: [{ type: "image/png", getAsFile: () => image }],
      },
    });

    await waitFor(() => {
      expect(screen.getByText("图片已准备好")).toBeInTheDocument();
    });
  });

  it("拖拽图片到聊天区域时会生成待发送预览", async () => {
    const user = userEvent.setup();
    render(<AIAssistant />);

    await user.click(screen.getByRole("button", { name: "AI 助手" }));
    const dropArea = document.querySelector(
      '[data-slot="card-content"]',
    ) as HTMLElement;
    const image = new File(["img"], "drop.png", { type: "image/png" });

    fireEvent.drop(dropArea, {
      dataTransfer: { files: [image] },
    });

    await waitFor(() => {
      expect(screen.getByText("图片已准备好")).toBeInTheDocument();
    });
  });

  it("悬浮按钮可拖拽移动", async () => {
    render(<AIAssistant />);

    const trigger = screen.getByRole("button", { name: "AI 助手" });
    fireEvent.pointerDown(trigger, { clientX: 320, clientY: 640 });
    fireEvent.pointerMove(window, { clientX: 120, clientY: 320 });
    fireEvent.pointerUp(window, { clientX: 120, clientY: 320 });

    expect(trigger.style.left).not.toBe("");
    expect(trigger.style.top).not.toBe("");
  });
});

describe("AIAssistant 来源说明与操作记录入口（B56）", () => {
  const sendQuestion = async () => {
    const reader = createMockSseReader([
      'data: {"type":"chunk","content":"本月应收 ¥1,000"}\n\n',
      'data: {"type":"done","model":"kimi","pendingActions":[]}\n\n',
    ]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      body: { getReader: () => reader },
    } as unknown as Response);
    const user = userEvent.setup();
    render(<AIAssistant />);
    await user.click(screen.getByRole("button", { name: "AI 助手" }));
    return user;
  };
  const asRole = (role: Role | null) =>
    useAuthStore.setState({ user: role ? ({ role } as User) : null });

  it("管理员在面板底部看到指向「设置 > AI 用量」的操作记录入口", async () => {
    asRole(Role.ADMIN);
    await sendQuestion();
    expect(
      screen.getByRole("link", { name: "查看助手操作记录" }),
    ).toHaveAttribute("href", "/dashboard/settings/ai-usage");
    asRole(null);
  });

  it("非管理员不显示操作记录入口（该页只有管理员能进）", async () => {
    asRole(Role.SALES);
    await sendQuestion();
    expect(screen.queryByRole("link", { name: "查看助手操作记录" })).toBeNull();
    asRole(null);
  });

  it("回答完成后标注生成时间与核对口径；开场白不加", async () => {
    asRole(null);
    const user = await sendQuestion();
    expect(screen.queryByText(/AI 回答 · /)).toBeNull();
    await user.type(
      screen.getByPlaceholderText("输入问题或粘贴图片..."),
      "应收",
    );
    await user.keyboard("{Enter}");
    expect(
      await screen.findByText(
        /AI 回答 · \d{2}:\d{2} 生成 · 金额与状态请以对应页面为准/,
      ),
    ).toBeInTheDocument();
  });
});
