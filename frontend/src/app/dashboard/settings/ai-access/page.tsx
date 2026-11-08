"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Bot,
  Copy,
  KeyRound,
  ShieldCheck,
  TerminalSquare,
  WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/PageHeader";
import { toast } from "sonner";

const DEFAULT_ORIGIN = "https://your-vps-host";

const copyText = async (text: string, successMessage: string) => {
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  } else {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  toast.success(successMessage);
};

const CodeBlock = ({
  title,
  code,
  copyLabel,
}: {
  title: string;
  code: string;
  copyLabel: string;
}) => (
  <Card className="min-w-0 border-border/70 bg-muted/20">
    <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
      <CardTitle className="text-sm">{title}</CardTitle>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void copyText(code, `${copyLabel}已复制`)}
      >
        <Copy className="mr-2 h-4 w-4" />
        {copyLabel}
      </Button>
    </CardHeader>
    <CardContent>
      <pre
        tabIndex={0}
        aria-label={title}
        className="max-w-full overflow-x-auto rounded-lg bg-background p-4 text-xs leading-6 text-foreground"
      >
        <code>{code}</code>
      </pre>
    </CardContent>
  </Card>
);

export default function AboutAgentPage() {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : DEFAULT_ORIGIN;

  const envSnippet = useMemo(
    () =>
      [
        `export JIESONG_BASE_URL="${origin}"`,
        'export JIESONG_AGENT_TOKEN="jsa_xxx.yyy"',
      ].join("\n"),
    [origin],
  );

  const mcpSnippet = useMemo(
    () =>
      [
        `curl -sS "${origin}/mcp" \\`,
        '  -H "Authorization: Bearer $JIESONG_AGENT_TOKEN" \\',
        '  -H "Content-Type: application/json" \\',
        `  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`,
      ].join("\n"),
    [origin],
  );

  const cliSearchSnippet = useMemo(
    () =>
      [
        "cd /path/to/jiesong_system/backend",
        'JIESONG_BASE_URL="$JIESONG_BASE_URL" \\',
        'JIESONG_AGENT_TOKEN="$JIESONG_AGENT_TOKEN" \\',
        "npm run agent:cli -- search 瓷砖 --types product,supplier,purchase --json",
      ].join("\n"),
    [],
  );

  const cliCreateSnippet = useMemo(
    () =>
      [
        "cat > purchase.json <<'EOF'",
        "{",
        '  "supplierId": "supplier-1",',
        '  "taxRate": 13,',
        '  "note": "Agent 创建",',
        '  "items": [',
        '    { "productId": "product-1", "quantity": 10, "unitPrice": 45, "unit": "片" }',
        "  ]",
        "}",
        "EOF",
        "",
        'JIESONG_BASE_URL="$JIESONG_BASE_URL" \\',
        'JIESONG_AGENT_TOKEN="$JIESONG_AGENT_TOKEN" \\',
        "npm run agent:cli -- purchase create --file purchase.json --json",
      ].join("\n"),
    [],
  );

  const oneLineInstallSnippet = useMemo(
    () =>
      [
        `JIESONG_BASE_URL="${origin}" JIESONG_USERNAME="your-username" JIESONG_PASSWORD="your-password" curl -fsSL ${origin}/agent/install.sh | bash`,
      ].join("\n"),
    [origin],
  );

  return (
    <div className="min-w-0 space-y-6 break-words">
      <PageHeader
        title="AI 接入"
        description="配置远程 HTTP MCP 与本机 CLI，供内部 Agent 访问系统数据与工具。"
        actions={
          <Button asChild variant="outline">
            <Link href="/dashboard/settings/users">
              <KeyRound className="mr-2 h-4 w-4" />
              打开账号管理
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-primary/15 bg-gradient-to-br from-background via-background to-primary/5">
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">内部接入</Badge>
              <span className="text-xs text-muted-foreground">
                推荐先配远程 HTTP MCP，再补本机 CLI
              </span>
            </div>
            <CardTitle className="text-2xl">
              一套系统，两种接法：远程 Agent 与本机 Agent。
            </CardTitle>
            <CardDescription>
              输入系统地址与账号密码即可接入 Agent，支持查询、录入与修改。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border bg-background p-4">
                <div className="mb-2 flex items-center gap-2 font-medium">
                  <Bot className="h-4 w-4 text-primary" />
                  远程 Agent（推荐）
                </div>
                <p className="text-sm text-muted-foreground">
                  适合 OpenClaw、飞书桥接、内部 VPS 上的自动化
                  Agent。默认直接用内部用户自己的账号密码换取
                  JWT，不要求管理员先签专用 token。
                </p>
              </div>
              <div className="rounded-xl border bg-background p-4">
                <div className="mb-2 flex items-center gap-2 font-medium">
                  <TerminalSquare className="h-4 w-4 text-primary" />
                  本机 Agent / CLI
                </div>
                <p className="text-sm text-muted-foreground">
                  适合本地调试、脚本集成、先验证能力再迁移到 MCP。命令层和 MCP
                  共用同一套能力。
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
              内部普通使用默认走“自己的账号密码 + 系统权限”。
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                Agent token
              </code>{" "}
              现在保留为高级模式，更适合长期无人值守的内部自动化。
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">接入前准备</CardTitle>
            <CardDescription>
              完成以下三步即可启用内部 Agent 接入。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="rounded-lg border p-3">
              <p className="font-medium text-foreground">1. 创建 Agent 账号</p>
              <p>
                当前实现会自动赋予固定能力集：
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  search.read
                </code>
                、
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  purchase.create/update
                </code>
                、
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  supplier.create/update
                </code>
                。暂不支持在页面里逐项勾选权限。
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="font-medium text-foreground">
                2. 默认直接用自己的账号密码
              </p>
              <p>
                普通内部用户不需要再等管理员签
                token。安装命令会直接用当前用户的账号密码换取 JWT 并保存。
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="font-medium text-foreground">
                3. 把系统地址给 Agent
              </p>
              <p>
                当前系统地址：
                <span className="font-mono text-foreground">{origin}</span>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <CodeBlock
          title="一键安装命令（推荐给内部同事）"
          code={oneLineInstallSnippet}
          copyLabel="复制安装命令"
        />
        <CodeBlock
          title="环境变量（远程 Agent / 本机 CLI 都通用）"
          code={envSnippet}
          copyLabel="复制环境变量"
        />
        <CodeBlock
          title="远程 HTTP MCP 最小探活（推荐）"
          code={mcpSnippet}
          copyLabel="复制探活命令"
        />
        <CodeBlock
          title="本机 CLI 查询示例"
          code={cliSearchSnippet}
          copyLabel="复制查询命令"
        />
        <CodeBlock
          title="本机 CLI 录入采购示例"
          code={cliCreateSnippet}
          copyLabel="复制录入命令"
        />
        <CodeBlock
          title="OpenClaw 客户端模板"
          code={[
            "# 推荐：先执行上面的一键安装命令",
            "command: jiesong-agent-mcp",
            "transport: stdio",
            "base_url: 已写入 ~/.config/jiesong-agent/config.env",
          ].join("\n")}
          copyLabel="复制 OpenClaw 模板"
        />
        <CodeBlock
          title="通用 MCP 客户端模板"
          code={[
            `endpoint: ${origin}/mcp`,
            "auth_header: Authorization: Bearer <user-jwt-or-agent-token>",
            "recommended_probe: tools/list",
            "recommended_tool: search_entities",
          ].join("\n")}
          copyLabel="复制 MCP 模板"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">一句话提示词示例</CardTitle>
            <CardDescription>
              支持通过自然语言向 Agent 下达查询、录入与修改指令。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-lg border p-3">
              <p className="font-medium">查询</p>
              <p className="text-muted-foreground">
                查一下最近采购过“瓷砖”的供应商、最近价格和对应采购合同。
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="font-medium">录入</p>
              <p className="text-muted-foreground">
                为佛山 A 厂创建一份采购单，商品是瓷砖 10 片，单价 45，税率 13%。
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="font-medium">修改</p>
              <p className="text-muted-foreground">
                把供应商{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  supplier-1
                </code>{" "}
                的联系人电话改成 13800000000，并保留其他字段不变。
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5 text-primary" />
              使用提醒
            </CardTitle>
            <CardDescription>接入配置与权限边界说明。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="rounded-lg border p-3">
              <p className="font-medium text-foreground">
                远程用 MCP，本机调 CLI。
              </p>
              <p>
                如果 Agent 在远程服务器、飞书桥接或 VPS 上运行，优先接入{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  {origin}/mcp
                </code>
                。如果在本机调试或运行脚本，优先使用{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  npm run agent:cli -- ...
                </code>
                。
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="font-medium text-foreground">
                最快接入方式：一条命令安装本地桥。
              </p>
              <p>
                复制上方“一键安装命令”，填入用户名和密码后执行，即可在本机安装{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  jiesong-agent-mcp
                </code>{" "}
                并自动换取 JWT，通过 stdio 连接远程 HTTP MCP。
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="font-medium text-foreground">
                权限仍然跟随用户账号。
              </p>
              <p>
                内部用户通过自己的账号接入后，Agent
                能执行的动作仍受这个用户本身权限约束，不会因为安装了桥接就自动获得额外权限。
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="font-medium text-foreground">
                专用 token 留给长期自动化。
              </p>
              <p>
                如果要做无人值守任务，再去 Agent 管理页签发专用
                token。系统会记录签发、轮换和吊销，并会提示即将过期。
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="font-medium text-foreground">
                先探活，再执行写操作。
              </p>
              <p>
                推荐先调用{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  tools/list
                </code>{" "}
                或{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  search
                </code>{" "}
                确认配置无误，再执行创建或修改，避免直接触发 401/403。
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="font-medium text-foreground">当前远程入口</p>
              <p className="font-mono text-foreground break-all">
                {origin}/mcp
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <WandSparkles className="h-5 w-5 text-primary" />
            内部推广建议
          </CardTitle>
          <CardDescription>
            向内部成员同步以下三项信息即可快速启用：
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3 text-sm text-muted-foreground">
          <div className="rounded-lg border p-4">
            <p className="font-medium text-foreground">一条安装命令</p>
            <p>让同事直接复制执行，不需要先理解 token、MCP 或 CLI 细节。</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="font-medium text-foreground">一个系统账号</p>
            <p>
              默认就用他自己的账号密码接入，减少“还要找管理员签 token”的阻力。
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="font-medium text-foreground">三句可直接说的话</p>
            <p>查询、录入、修改各准备一句，让同事第一天就能上手。</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
