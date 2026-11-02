/**
 * Input: SystemConfigTab、configService mock
 * Output: 系统配置 Tab 关键 UI 与保存字段回归
 * Pos: 设置 > 系统配置单测
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SystemConfigTab } from "./SystemConfigTab";

const mockGetSystemConfig = vi.fn();
const mockUpdateSystemConfig = vi.fn();

vi.mock("@/services/config.service", () => ({
  configService: {
    getSystemConfig: (...args: unknown[]) => mockGetSystemConfig(...args),
    updateSystemConfig: (...args: unknown[]) => mockUpdateSystemConfig(...args),
  },
}));

vi.mock("@/lib/axios", () => ({
  default: { post: vi.fn() },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("SystemConfigTab", () => {
  beforeEach(() => {
    mockGetSystemConfig.mockReset();
    mockUpdateSystemConfig.mockReset();
    mockGetSystemConfig.mockResolvedValue({
      data: {
        exchangeRate: 7.2,
        profitRate: 1.3,
        units: ["件"],
        brokers: ["捷淞"],
        aiTemperature: 0.7,
        aiMaxTokens: 4096,
      },
    });
    mockUpdateSystemConfig.mockResolvedValue({});
  });

  it("加载后展示 AI 模型优先级与温度、Max tokens", async () => {
    render(<SystemConfigTab />);

    await waitFor(() => {
      expect(screen.getByText(/采样温度/)).toBeInTheDocument();
    });

    expect(screen.getAllByText(/采样温度/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/最大输出长度/).length).toBeGreaterThan(0);
    expect(screen.getByText(/0\.7 — 均衡/)).toBeInTheDocument();
  });

  it("保存时写入 aiTemperature 与 aiMaxTokens", async () => {
    const user = userEvent.setup();
    render(<SystemConfigTab />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /保存配置/ }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /保存配置/ }));

    await waitFor(() => {
      const calls = mockUpdateSystemConfig.mock.calls.map(
        (c) => c[0] as Record<string, unknown>,
      );
      const hasTemp = calls.some((p) => p.aiTemperature === 0.7);
      const hasMax = calls.some((p) => p.aiMaxTokens === 4096);
      expect(hasTemp).toBe(true);
      expect(hasMax).toBe(true);
    });
  });

  it("从不渲染后端返回的完整 Kimi 密钥，只展示已配置状态", async () => {
    const secret = "sk-test-secret-should-never-render";
    mockGetSystemConfig.mockResolvedValueOnce({
      data: {
        exchangeRate: 7.2,
        profitRate: 1.3,
        units: ["件"],
        brokers: ["捷淞"],
        apiKey: secret,
      },
    });

    render(<SystemConfigTab />);

    await waitFor(() => {
      expect(screen.getByText("已配置（只写）")).toBeInTheDocument();
    });

    expect(screen.queryByText(secret)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(secret);
  });

  it("Kimi 配置仍将新密钥写入原 apiKey 字段", async () => {
    const user = userEvent.setup();
    render(<SystemConfigTab />);
    const input = await screen.findByPlaceholderText(
      "输入 Kimi API Key (sk-...)",
    );
    // 合成测试占位符，不是生产凭据。
    await user.type(input, "test-only-nonproduction-placeholder");
    await user.click(screen.getByRole("button", { name: /保存配置/ }));
    await waitFor(() =>
      expect(mockUpdateSystemConfig).toHaveBeenCalledWith({
        apiKey: "test-only-nonproduction-placeholder",
      }),
    );
  });

  it("DeepSeek 限定 Flash 模型、思考模式和专用密钥字段，保留原温度", async () => {
    // 合成测试占位符，不是生产凭据。
    const newKey = "test-only-nonproduction-placeholder";
    mockGetSystemConfig.mockResolvedValueOnce({
      data: {
        exchangeRate: 7.2,
        profitRate: 1.3,
        aiProvider: "deepseek",
        apiKey: "********configured",
        deepseekApiKey: "********configured",
        aiChatModel: "kimi-k2-turbo-preview",
        aiHsCodeModel: "moonshot-v1-8k",
        aiThinking: true,
        aiReasoningEffort: "high",
        aiTemperature: 0.7,
      },
    });
    const user = userEvent.setup();
    render(<SystemConfigTab />);

    expect(await screen.findByText("DeepSeek API Key")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "控制台" })).toHaveAttribute(
      "href",
      "https://platform.deepseek.com/api_keys",
    );
    expect(screen.getByText(/思考模式已开启.*high/)).toBeInTheDocument();
    // 思考模式不使用温度：滑杆不渲染，而不是留一个禁用的摆设
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByText(/采样温度/)).toBeNull();
    const keyInput = screen.getByPlaceholderText("输入新 Key 以覆盖");
    expect(keyInput).toHaveValue("");
    await user.click(screen.getAllByRole("combobox")[0]);
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(
      screen.getByRole("option", { name: "DeepSeek 思考模式" }),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.type(keyInput, newKey);
    await user.click(screen.getByRole("button", { name: /保存配置/ }));

    await waitFor(() =>
      expect(mockUpdateSystemConfig).toHaveBeenCalledWith({
        deepseekApiKey: newKey,
      }),
    );
    const writes = Object.assign(
      {},
      ...mockUpdateSystemConfig.mock.calls.map((c) => c[0]),
    );
    expect(writes).toMatchObject({
      aiChatModel: "deepseek-flash",
      aiHsCodeModel: "deepseek-flash",
    });
    expect(writes).not.toHaveProperty("apiKey");
    expect(writes).not.toHaveProperty("aiTemperature");
  });

  it("OpenAI 不按 Kimi 处理：无密钥输入、只展示服务器状态，保存不写密钥或模型", async () => {
    mockGetSystemConfig.mockResolvedValueOnce({
      data: {
        exchangeRate: 7.2,
        profitRate: 1.3,
        aiProvider: "openai",
        openaiConfigured: true,
        openaiModel: "gpt-6.1-terra",
        aiChatModel: "kimi-k2-turbo-preview",
        aiTemperature: 0.7,
        aiMaxTokens: 4096,
      },
    });
    const user = userEvent.setup();
    render(<SystemConfigTab />);

    expect(await screen.findByText("OpenAI API Key")).toBeInTheDocument();
    expect(screen.getByText("服务器已配置")).toBeInTheDocument();
    expect(screen.queryByText(/Kimi/)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/API Key/)).not.toBeInTheDocument();
    // 内部模型 ID 不出现在页面上，只显示业务名称
    expect(screen.queryByText("gpt-6.1-terra")).toBeNull();
    expect(screen.getAllByText("OpenAI 智能模型").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /保存配置/ }));
    await waitFor(() => expect(mockUpdateSystemConfig).toHaveBeenCalled());
    const writes = Object.assign(
      {},
      ...mockUpdateSystemConfig.mock.calls.map((c) => c[0]),
    );
    expect(
      Object.keys(writes).filter((k) =>
        /apikey|openai|aiChatModel|aiHsCodeModel|aiTemperature|aiMaxTokens/i.test(
          k,
        ),
      ),
    ).toEqual([]);
  });

  it("OpenAI：实际使用的模型只来自服务器，不再把库里残留的 Kimi 选择当成生效配置", async () => {
    mockGetSystemConfig.mockResolvedValueOnce({
      data: {
        exchangeRate: 7.2,
        profitRate: 1.3,
        aiProvider: "openai",
        openaiConfigured: true,
        openaiModel: "gpt-6.1-terra",
        openaiMaxOutputTokens: 16000,
        aiChatModel: "kimi-k2-turbo-preview",
        aiHsCodeModel: "kimi-k2-turbo-preview",
        aiTemperature: 0.7,
        aiMaxTokens: 4096,
      },
    });
    render(<SystemConfigTab />);

    const effective = await screen.findByTestId("effective-models");
    await waitFor(() => expect(effective).toHaveTextContent("OpenAI 智能模型"));
    expect(effective).toHaveTextContent("来源：服务器配置");
    expect(screen.queryByText(/kimi-k2-turbo-preview/)).toBeNull();
    // 温度/输出长度对 OpenAI 不适用：控件直接不渲染，只留一句说明
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByLabelText(/最大输出长度/)).toBeNull();
    expect(screen.getByTestId("sampling-not-applicable")).toHaveTextContent(
      "回复风格由服务器统一设置",
    );
    // 页面任何位置都不暴露环境变量名或内部模型 ID
    const text = document.body.textContent ?? "";
    for (const leaked of [
      "OPENAI_MODEL",
      "max_completion_tokens",
      "gpt-6.1-terra",
      "OPENAI_MAX_OUTPUT_TOKENS",
    ]) {
      expect(text).not.toContain(leaked);
    }
  });

  it("OpenAI 读不到服务器模型时，不显示空白的「当前实际使用」行", async () => {
    mockGetSystemConfig.mockResolvedValueOnce({
      data: {
        exchangeRate: 7.2,
        profitRate: 1.3,
        aiProvider: "openai",
        openaiConfigured: true,
        aiChatModel: "kimi-k2-turbo-preview",
      },
    });
    render(<SystemConfigTab />);
    expect(await screen.findByText("OpenAI API Key")).toBeInTheDocument();
    expect(screen.queryByTestId("effective-models")).toBeNull();
    expect(screen.queryByText("未读取到服务器模型")).toBeNull();
  });

  it("Kimi：实际使用的模型就是此页保存的设置，并标明来源", async () => {
    mockGetSystemConfig.mockResolvedValueOnce({
      data: {
        exchangeRate: 7.2,
        profitRate: 1.3,
        aiProvider: "kimi",
        aiChatModel: "kimi-k2-thinking-turbo",
        aiHsCodeModel: "moonshot-v1-8k",
        aiTemperature: 0.7,
        aiMaxTokens: 4096,
      },
    });
    render(<SystemConfigTab />);

    const effective = await screen.findByTestId("effective-models");
    await waitFor(() => expect(effective).toHaveTextContent("Kimi 深度推理"));
    expect(effective).toHaveTextContent("Kimi 快速");
    expect(effective).not.toHaveTextContent("kimi-k2-thinking-turbo");
    expect(effective).not.toHaveTextContent("moonshot-v1-8k");
    // Kimi 才有温度滑杆
    expect(screen.getByRole("slider")).not.toHaveAttribute("data-disabled");
    expect(effective).toHaveTextContent("来源：此页保存的设置");
    expect(screen.getByLabelText(/最大输出长度/)).not.toBeDisabled();
  });

  it("DeepSeek：实际使用 deepseek-flash，来源是系统固定值", async () => {
    mockGetSystemConfig.mockResolvedValueOnce({
      data: {
        exchangeRate: 7.2,
        profitRate: 1.3,
        aiProvider: "deepseek",
        aiChatModel: "kimi-k2-turbo-preview",
        aiTemperature: 0.7,
        aiMaxTokens: 4096,
      },
    });
    render(<SystemConfigTab />);

    const effective = await screen.findByTestId("effective-models");
    await waitFor(() =>
      expect(effective).toHaveTextContent("DeepSeek 思考模式"),
    );
    expect(effective).toHaveTextContent("来源：系统固定为 DeepSeek 思考模式");
    expect(effective).not.toHaveTextContent("deepseek-flash");
    expect(screen.queryByText(/kimi-k2-turbo-preview/)).toBeNull();
  });
});
