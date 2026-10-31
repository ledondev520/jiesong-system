/**
 * Input: 港口服务 API
 * Output: 港口管理页面（表格、批量操作、导入导出）
 * Pos: 系统设置 > 基础数据 > 港口管理
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getSystemPorts,
  createSystemPort,
  updateSystemPort,
  deleteSystemPort,
  SystemPortItem,
} from "@/services/system.service";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Search, X } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { toast } from "sonner";
import { runAwait } from "@/lib/run-await";
import { Input } from "@/components/ui/input";
import { PageSizeSelect } from "@/components/ui/page-size-select";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorState } from "@/components/ui/data-state";
import { BatchActionBar } from "@/components/settings/BatchActionBar";
import { ImportExportButtons } from "@/components/settings/ImportExportButtons";
import * as XLSX from "xlsx";

const PORT_STATUS_MAP = {
  ACTIVE: { label: "正常", tone: "success" },
  INACTIVE: { label: "已停用", tone: "neutral" },
} as const;

export default function PortsPage() {
  const [ports, setPorts] = useState<SystemPortItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPort, setEditingPort] = useState<SystemPortItem | null>(null);
  const [keyword, setKeyword] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const requestPorts = useCallback(
    () =>
      runAwait(
        () => getSystemPorts({ page: 1, pageSize: 100 }),
        (response) => {
          setLoadError(null);
          setPorts(response.data?.items || []);
        },
        (error) => {
          setLoadError(error ?? new Error("加载失败"));
        },
        () => {
          setLoading(false);
        },
      ),
    [],
  );

  const loadPorts = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    return requestPorts();
  }, [requestPorts]);

  // loading 初值为 true，挂载时原先的 setLoading(true) 不改变状态，effect 只需发请求。
  useEffect(() => {
    void requestPorts();
  }, [requestPorts]);

  const handleCreate = () => {
    setEditingPort(null);
    setFormName("");
    setFormCode("");
    setIsDialogOpen(true);
  };

  const handleEdit = (port: SystemPortItem) => {
    setEditingPort(port);
    setFormName(port.name);
    setFormCode(port.code);
    setIsDialogOpen(true);
  };

  const deactivatePort = async (id: string) => {
    try {
      await deleteSystemPort(id);
      setPorts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, isActive: false } : p)),
      );
      toast.success("港口已停用");
    } catch {
      toast.error("停用失败");
    }
  };

  // 移动端卡片仍用浏览器确认；桌面表格走「更多」里的确认对话框
  const handleDelete = async (id: string) => {
    if (confirm("确定要停用此港口吗？")) {
      await deactivatePort(id);
    }
  };

  const handleBatchDelete = async () => {
    if (confirm(`确定要停用选中的 ${selectedIds.size} 个港口吗？`)) {
      const ids = Array.from(selectedIds);
      const results = await Promise.allSettled(
        ids.map((id) => deleteSystemPort(id)),
      );
      const successCount = results.filter(
        (r) => r.status === "fulfilled",
      ).length;
      setPorts(
        ports.map((p) =>
          selectedIds.has(p.id) ? { ...p, isActive: false } : p,
        ),
      );
      setSelectedIds(new Set());
      toast.success(`已停用 ${successCount} 个港口`);
    }
  };

  const handleSubmit = async () => {
    const name = formName.trim();
    const code = formCode.trim().toUpperCase();
    if (!name || !code) {
      toast.error("港口名称和代码不能为空");
      return;
    }
    setSubmitting(true);
    try {
      if (editingPort) {
        await updateSystemPort(editingPort.id, { name, code });
        toast.success("港口更新成功");
      } else {
        await createSystemPort({ name, code });
        toast.success("港口创建成功");
      }
      setIsDialogOpen(false);
      loadPorts();
    } catch {
      toast.error(editingPort ? "更新失败" : "创建失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleImport = async (rows: Array<Record<string, unknown>>) => {
    const payloads = rows
      .map((r) => ({
        name: String(r["名称"] || r["name"] || ""),
        code: String(r["代码"] || r["code"] || "").toUpperCase(),
      }))
      .filter((r) => r.name && r.code);

    if (payloads.length === 0) throw new Error("无有效数据");

    await Promise.allSettled(payloads.map((p) => createSystemPort(p)));
    loadPorts();
  };

  const filteredPorts = keyword.trim()
    ? ports.filter((p) => {
        const kw = keyword.trim().toLowerCase();
        return (
          p.name.toLowerCase().includes(kw) || p.code.toLowerCase().includes(kw)
        );
      })
    : ports;

  const totalPages = Math.ceil(filteredPorts.length / pageSize);
  const pagedPorts = filteredPorts.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const columns: DataTableColumn<SystemPortItem>[] = [
    {
      key: "name",
      header: "名称",
      cell: (port) => <span className="font-medium">{port.name}</span>,
      sortValue: (port) => port.name,
      hideable: false,
    },
    {
      key: "code",
      header: "代码",
      cell: (port) => (
        <span className="font-mono text-xs text-muted-foreground">
          {port.code}
        </span>
      ),
      sortValue: (port) => port.code,
      hideable: false,
    },
    {
      key: "status",
      header: "状态",
      cell: (port) => (
        <StatusBadge
          status={port.isActive ? "ACTIVE" : "INACTIVE"}
          statusMap={PORT_STATUS_MAP}
        />
      ),
      hideable: false,
    },
  ];

  const handleReset = () => {
    setKeyword("");
    setCurrentPage(1);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="港口管理"
        description="维护装卸港口基础数据"
        actions={
          <div className="hidden flex-wrap items-center gap-2 md:flex">
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索港口名称或代码..."
                value={keyword}
                onChange={(e) => {
                  setKeyword(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-10 rounded-xl border-border/70 bg-background/70 pl-9"
              />
            </div>
            {keyword && (
              <Button
                variant="ghost"
                size="sm"
                className="h-10 rounded-xl"
                onClick={handleReset}
              >
                <X className="mr-1 h-4 w-4" />
                重置
              </Button>
            )}
            <ImportExportButtons
              data={filteredPorts as unknown as Record<string, unknown>[]}
              filename="港口数据"
              columns={[
                { key: "name", label: "名称" },
                { key: "code", label: "代码" },
                { key: "isActive", label: "状态" },
              ]}
              onImport={handleImport}
            />
            <Button onClick={handleCreate} className="h-10 rounded-xl">
              <Plus className="mr-2 h-4 w-4" /> 新增港口
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:hidden">
        <Button
          variant="outline"
          className="h-11 rounded-2xl"
          onClick={() => setIsDialogOpen(true)}
        >
          <Plus className="mr-2 h-4 w-4" />
          新增港口
        </Button>
      </div>

      <BatchActionBar
        count={selectedIds.size}
        onDelete={handleBatchDelete}
        onExport={() => {
          const selected = ports.filter((p) => selectedIds.has(p.id));
          if (selected.length === 0) return;
          const ws = XLSX.utils.json_to_sheet(
            selected.map((p) => ({
              名称: p.name,
              代码: p.code,
              状态: p.isActive ? "正常" : "已停用",
            })),
          );
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "港口");
          XLSX.writeFile(wb, "选中港口数据.xlsx");
          toast.success("导出成功");
        }}
        onClear={() => setSelectedIds(new Set())}
      />

      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={pagedPorts}
          rowKey={(port) => port.id}
          loading={loading}
          error={loadError}
          errorWhat="加载港口失败"
          onRetry={() => void loadPorts()}
          emptyTitle={keyword ? "没有符合条件的港口" : "暂无港口数据"}
          emptyDescription={
            keyword ? undefined : "还没有添加任何港口，点击下方的按钮开始创建"
          }
          emptyAction={
            keyword ? undefined : (
              <Button onClick={handleCreate}>新增港口</Button>
            )
          }
          selection={{ selectedIds, onChange: setSelectedIds }}
          renderActions={(port) => (
            <RowActionsMenu
              onEdit={() => handleEdit(port)}
              onDelete={() => deactivatePort(port.id)}
              deleteLabel="停用"
              confirmTitle={`停用港口「${port.name}」？`}
              confirmDescription="停用后该港口不再出现在选择列表中，已有单据不受影响。"
            />
          )}
        />
      </div>

      {/* 移动端卡片视图 */}
      <div className="grid gap-3 md:hidden">
        {loading ? (
          <Card className="border-dashed border-border/70">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              加载中...
            </CardContent>
          </Card>
        ) : loadError ? (
          <ErrorState
            what="加载港口失败"
            error={loadError}
            onRetry={() => void loadPorts()}
          />
        ) : pagedPorts.length === 0 ? (
          <Card className="border-dashed border-border/70">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {keyword ? "没有符合条件的港口" : "暂无港口数据。"}
            </CardContent>
          </Card>
        ) : (
          pagedPorts.map((port) => (
            <Card key={port.id} className="border-border/70">
              <CardContent className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-base font-semibold tracking-tight">
                      {port.name}
                    </p>
                    <p className="text-sm text-muted-foreground">{port.code}</p>
                  </div>
                  {port.isActive ? (
                    <Badge
                      variant="outline"
                      className="rounded-full border-primary/20 bg-primary/5 text-primary"
                    >
                      正常
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="rounded-full">
                      已停用
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    className="h-11 rounded-2xl"
                    onClick={() => handleEdit(port)}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    编辑
                  </Button>
                  <Button
                    variant="outline"
                    className="h-11 rounded-2xl border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive"
                    onClick={() => handleDelete(port.id)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    停用
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* 分页控制 */}
      {!loading && !loadError ? (
        <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>
            共 {filteredPorts.length} 条
            {totalPages > 1 ? `，第 ${currentPage}/${totalPages} 页` : ""}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <PageSizeSelect
              value={pageSize}
              onChange={(size) => {
                setPageSize(size);
                setCurrentPage(1);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages <= 1}
            >
              下一页
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{editingPort ? "编辑港口" : "新增港口"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="port-name">港口名称 *</Label>
              <Input
                id="port-name"
                placeholder="例如：深圳港"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="port-code">港口代码 *</Label>
              <Input
                id="port-code"
                placeholder="例如：SZ"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
