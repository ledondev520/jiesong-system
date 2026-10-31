/**
 * Input: 所属客户、可选的已有门店、保存回调
 * Output: 新增/编辑门店对话框（简称 2–12 位 A-Z0-9-，经营主体、目的港）
 * Pos: 客户详情 > 门店；写入走现有 /stores 接口（角色不变），新门店必须带 customerId
 */
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { storeService } from "@/services/store.service";
import { describeFailure } from "@/lib/error-reason";
import type { Port, Store } from "@/types";

const CODE_PATTERN = /^[A-Z0-9-]{2,12}$/;

interface StoreDialogProps {
  customerId: string;
  store?: Store | null;
  onClose: () => void;
  onSaved: (store: Store) => void;
}

export function StoreDialog({ customerId, store, onClose, onSaved }: StoreDialogProps) {
  const [ports, setPorts] = useState<Port[]>([]);
  const [portsError, setPortsError] = useState(false);
  const [name, setName] = useState(store?.name ?? "");
  const [code, setCode] = useState(store?.code ?? "");
  const [legalName, setLegalName] = useState(store?.legalName ?? "");
  const [portId, setPortId] = useState(store?.portId ?? "");
  const [address, setAddress] = useState(store?.address ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    storeService
      .getPorts()
      .then((response) => alive && setPorts(response.data.filter((port) => port.isActive !== false)))
      .catch(() => alive && setPortsError(true));
    return () => {
      alive = false;
    };
  }, []);

  const submit = async () => {
    const normalizedCode = code.trim().toUpperCase();
    if (!name.trim()) return setError("门店名称不能为空");
    if (!portId) return setError("请选择目的港");
    if (normalizedCode && !CODE_PATTERN.test(normalizedCode))
      return setError("门店简称须为 2–12 位字母、数字或连字符");
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        portId,
        // 编辑时空串 = 清空；新增时不发送空值
        ...(normalizedCode || store ? { code: normalizedCode } : {}),
        ...(legalName.trim() || store ? { legalName: legalName.trim() } : {}),
        ...(address.trim() || store ? { address: address.trim() } : {}),
      };
      const response = store
        ? await storeService.update(store.id, payload)
        : await storeService.create({ ...payload, customerId });
      toast.success(store ? "门店已更新" : "门店已创建");
      onSaved(response.data);
    } catch (reason) {
      setError(describeFailure("保存失败", reason));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{store ? "编辑门店" : "新增门店"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="store-name">门店名称 *</Label>
            <Input id="store-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="store-code">门店简称（唯一，用于唛头和报价行）</Label>
            <Input id="store-code" value={code} maxLength={12} onChange={(e) => setCode(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="store-legal">经营主体（收货方抬头）</Label>
            <Input id="store-legal" value={legalName} onChange={(e) => setLegalName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="store-port">目的港 *</Label>
            <select
              id="store-port"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={portId}
              onChange={(e) => setPortId(e.target.value)}
            >
              <option value="">请选择</option>
              {ports.map((port) => (
                <option key={port.id} value={port.id}>{port.name}</option>
              ))}
            </select>
            {portsError ? <p className="text-xs text-destructive">港口加载失败，请关闭后重试</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="store-address">地址</Label>
            <Input id="store-address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
        </div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>取消</Button>
          <Button onClick={() => void submit()} disabled={submitting}>
            {submitting ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
