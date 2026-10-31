/**
 * Input: Agent 工具注册表数据
 * Output: Agent 工具注册表概览卡片
 * Pos: Dashboard AI 管理模块（settings/ai-usage 页面拆分）
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type AiAgentToolRegistryResponse } from "@/services/ai.service";
import { Badge } from "@/components/ui/badge";
import { buildRegistryDomainStats } from "../ai-usage-helpers";

export function AiToolRegistryCard({
  toolRegistry,
}: {
  toolRegistry: AiAgentToolRegistryResponse | null;
}) {
  const registryReadCount =
    toolRegistry?.tools?.filter((tool) => tool.access === "read").length ?? 0;
  const registryWriteCount =
    toolRegistry?.tools?.filter((tool) => tool.access === "write").length ?? 0;
  const registryDomainCount =
    toolRegistry?.domains?.length ??
    (toolRegistry?.tools
      ? new Set(toolRegistry.tools.map((tool) => tool.domain)).size
      : 0);
  const registryDomainStats = toolRegistry?.domains?.length
    ? toolRegistry.domains
    : buildRegistryDomainStats(toolRegistry);
  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Agent 工具注册表
          </CardTitle>
        </CardHeader>
        <CardContent>
          {toolRegistry ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">主入口</p>
                  <p className="mt-1 font-medium">
                    主入口 {toolRegistry.primaryAgentType}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">当前角色</p>
                  <p className="mt-1 font-medium">
                    当前角色 {toolRegistry.viewerRole || "—"}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">读工具</p>
                  <p className="mt-1 font-medium">{registryReadCount}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">写工具</p>
                  <p className="mt-1 font-medium">{registryWriteCount}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">覆盖域</p>
                  <p className="mt-1 font-medium">{registryDomainCount}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {registryDomainStats.map((item) => (
                  <Badge
                    key={item.domain}
                    variant="outline"
                    className="font-mono text-[10px]"
                  >
                    {item.domain} ×{item.toolCount}
                    {item.compositeToolCount
                      ? ` / 复合 ${item.compositeToolCount}`
                      : ""}
                  </Badge>
                ))}
              </div>
              {registryDomainStats.some((item) => item.description) ? (
                <div className="grid gap-2 md:grid-cols-2">
                  {registryDomainStats
                    .filter((item) => item.description)
                    .map((item) => (
                      <div
                        key={`${item.domain}-desc`}
                        className="rounded-lg border p-3"
                      >
                        <p className="text-xs font-medium text-foreground">
                          {item.label || item.domain}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.description}
                        </p>
                      </div>
                    ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              工具注册表加载失败或暂不可用。
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
