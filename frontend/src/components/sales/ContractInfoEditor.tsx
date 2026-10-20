/**
 * Input: SalesContract, Store[], onSave callback
 * Output: 可取消草稿、失败保留并明确重试的合同信息编辑表单
 * Pos: 出口合同详情页子组件，支持编辑合同基本信息
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import {
  BusinessWrite,
  useBusinessReadOnly,
} from "@/lib/hooks/useBusinessReadOnly";
import { useState, useEffect } from "react";
import { SalesContract, Store, SalesStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SemanticBadge } from "@/components/ui/semantic-badge";
import {
  Loader2,
  Save,
  Pencil,
  DollarSign,
  Scale,
  Container,
  Calendar,
  MapPin,
  Ship,
  CheckCircle2,
} from "lucide-react";
import { formatDate } from "@/lib/date-format";

interface ContractInfoEditorProps {
  contract: SalesContract;
  stores: Store[];
  onSave: (data: Partial<SalesContract>) => Promise<void>;
}

/**
 * 职责：从已保存合同建立独立编辑草稿，不改变空日期/港口的既有提交语义。
 * @param contract 当前已保存合同资料
 * @returns 供编辑或取消复原的四项已有合同头输入值
 */
const savedHeaderForm = (contract: SalesContract) => ({
  exchangeRate: contract.exchangeRate,
  signedAt: formatDate(contract.signedAt, ""),
  estimatedArrival: formatDate(contract.estimatedArrival, ""),
  portId: contract.portId || "",
});

/**
 * 职责：合同信息编辑表单
 * 思路：编辑已有头资料；取消恢复保存值，回调拒绝时保留草稿供明确重试
 * @param props 已保存合同、含港口关联的门店资料及普通异步保存回调
 * @returns 合同事实展示及可取消、可明确重试的头资料编辑界面
 */
export function ContractInfoEditor({
  contract,
  stores,
  onSave,
}: ContractInfoEditorProps) {
  const readOnly = useBusinessReadOnly();
  const [editingRequested, setIsEditing] = useState(false);
  const isEditing = editingRequested && !readOnly;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => savedHeaderForm(contract));

  // 当合同数据变化时同步表单
  useEffect(() => {
    setForm(savedHeaderForm(contract));
  }, [contract]);

  /**
   * 职责：取消当前草稿并恢复已保存头资料，不触发写入。
   * 参数：无；使用当前已保存合同资料。
   * @returns 无；复原四项输入并退出编辑状态
   */
  const handleCancel = () => {
    setForm(savedHeaderForm(contract));
    setIsEditing(false);
  };

  /**
   * 职责：等待普通保存完成；错误反馈由调用方负责，拒绝不关闭草稿。
   * 参数：无；向 onSave 提交当前四项头字段草稿。
   * @returns Promise<void>；成功退出编辑，失败保留草稿，均释放保存状态
   */
  const handleSave = async () => {
    // 0. 标记保存中并等待调用方的普通保存结果。
    setSaving(true);
    try {
      await onSave({
        exchangeRate: form.exchangeRate,
        signedAt: form.signedAt || undefined,
        estimatedArrival: form.estimatedArrival || undefined,
        portId: form.portId || undefined,
      });
      setIsEditing(false);
    } catch {
      // The detail page reports the original HTTP error; keep this draft retryable.
    } finally {
      // 1. 成功或失败均释放忙状态，允许后续明确操作。
      setSaving(false);
    }
  };

  const getStatusBadge = (status: SalesStatus) => {
    const statusMap: Record<
      SalesStatus,
      {
        label: string;
        tone: React.ComponentProps<typeof SemanticBadge>["tone"];
      }
    > = {
      [SalesStatus.DRAFT]: { label: "草稿", tone: "neutral" },
      [SalesStatus.CONFIRMED]: { label: "已确认", tone: "info" },
      [SalesStatus.PACKING]: { label: "装箱中", tone: "warning" },
      [SalesStatus.SHIPPED]: { label: "已发运", tone: "progress" },
      [SalesStatus.ARRIVED]: { label: "已到达", tone: "success" },
      [SalesStatus.COMPLETED]: { label: "已完成", tone: "secondary" },
      [SalesStatus.CANCELLED]: { label: "已取消", tone: "danger" },
    };
    const config = statusMap[status] || {
      label: status,
      tone: "neutral" as const,
    };
    return <SemanticBadge tone={config.tone}>{config.label}</SemanticBadge>;
  };

  // 从 stores 中获取唯一的港口列表
  const ports = stores
    .filter((s) => s.port)
    .map((s) => s.port!)
    .filter(
      (port, index, self) => self.findIndex((p) => p.id === port.id) === index,
    );

  const infoItems = [
    {
      icon: <Ship className="h-4 w-4 text-muted-foreground" />,
      label: "合同编号",
      value: contract.contractNo,
      editable: false,
    },
    {
      icon: <CheckCircle2 className="h-4 w-4 text-muted-foreground" />,
      label: "状态",
      value: getStatusBadge(contract.status),
      editable: false,
      isElement: true,
    },
    {
      icon: <DollarSign className="h-4 w-4 text-muted-foreground" />,
      label: "总金额",
      value: `$${(contract.totalAmount || 0).toLocaleString()}`,
      editable: false,
      highlight: true,
    },
    {
      icon: <DollarSign className="h-4 w-4 text-muted-foreground" />,
      label: "已收款",
      value: `$${(contract.receivedAmount || 0).toLocaleString()}`,
      editable: false,
      highlight: (contract.receivedAmount || 0) > 0,
    },
    {
      icon: <Container className="h-4 w-4 text-muted-foreground" />,
      label: "货物归属",
      value: contract.hasThirdPartyCargo ? "含第三方拼柜" : "仅捷淞货物",
      editable: false,
    },
    {
      icon: <Scale className="h-4 w-4 text-muted-foreground" />,
      label: "第三方来源",
      value:
        contract.sourceParties && contract.sourceParties.length > 0
          ? contract.sourceParties.join(", ")
          : "—",
      editable: false,
    },
    {
      icon: <DollarSign className="h-4 w-4 text-muted-foreground" />,
      label: "汇率",
      value: isEditing ? undefined : String(contract.exchangeRate),
      editable: true,
      editRender: (
        <Input
          aria-label="汇率"
          type="number"
          step="0.01"
          value={form.exchangeRate}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              exchangeRate: parseFloat(e.target.value) || 0,
            }))
          }
          className="h-8"
        />
      ),
    },
    {
      icon: <MapPin className="h-4 w-4 text-muted-foreground" />,
      label: "目的港",
      value: isEditing ? undefined : contract.port?.name || "-",
      editable: true,
      editRender: (
        <Select
          value={form.portId}
          onValueChange={(v) => setForm((prev) => ({ ...prev, portId: v }))}
        >
          <SelectTrigger className="h-8" aria-label="目的港">
            <SelectValue placeholder="选择目的港" />
          </SelectTrigger>
          <SelectContent>
            {ports.map((port) => (
              <SelectItem key={port.id} value={port.id}>
                {port.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      icon: <Calendar className="h-4 w-4 text-muted-foreground" />,
      label: "签订日期",
      value: isEditing ? undefined : formatDate(contract.signedAt),
      editable: true,
      editRender: (
        <Input
          aria-label="签订日期"
          type="date"
          value={form.signedAt}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, signedAt: e.target.value }))
          }
          className="h-8"
        />
      ),
    },
    {
      icon: <Calendar className="h-4 w-4 text-muted-foreground" />,
      label: "预计到达",
      value: isEditing ? undefined : formatDate(contract.estimatedArrival),
      editable: true,
      editRender: (
        <Input
          aria-label="预计到达"
          type="date"
          value={form.estimatedArrival}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, estimatedArrival: e.target.value }))
          }
          className="h-8"
        />
      ),
    },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Ship className="h-5 w-5 text-primary" />
            合同信息
          </CardTitle>
          <CardDescription>
            {isEditing ? "编辑合同基本信息" : "查看合同详情"}
          </CardDescription>
        </div>
        {!isEditing && (
          <BusinessWrite>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
            >
              <Pencil className="mr-2 h-4 w-4" /> 编辑
            </Button>
          </BusinessWrite>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2">
          {infoItems.map((item, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 rounded-lg border border-border/50 p-3"
            >
              <div className="mt-0.5">{item.icon}</div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  {item.label}
                </p>
                {isEditing && item.editable && item.editRender ? (
                  <div className="mt-1">{item.editRender}</div>
                ) : item.isElement ? (
                  <div className="mt-1">{item.value as React.ReactNode}</div>
                ) : (
                  <p
                    className={`text-sm font-medium truncate ${item.highlight ? "text-primary" : ""}`}
                  >
                    {item.value as string}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 编辑模式下的操作按钮 */}
        {isEditing && (
          <div className="flex gap-2 justify-end pt-5 border-t mt-5">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={saving}
            >
              取消
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  保存
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
