/**
 * Input: 供应商、永久删除预览（各类关联记录计数、阻断原因、确认令牌）
 * Output: ADMIN 永久删除确认弹窗；列出将删除的记录数量，阻断时仅说明原因，必须输入供应商名称才可确认
 * Pos: 供应商管理页（仅 ADMIN 可见入口）；归档不走此弹窗
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SupplierHardDeletePreview } from "@/services/supplier.service";

const COUNT_LABELS: Record<string, string> = {
  contracts: "采购合同",
  items: "采购明细",
  receipts: "到货记录",
  receiptItems: "到货明细",
  inspections: "验货记录",
  inventories: "库存记录",
  packingItems: "装箱明细",
  files: "合同附件记录",
  contractTemplates: "合同模板",
  productLinks: "商品关联",
  aliases: "供应商别名",
};

interface Props {
  supplierName: string;
  preview: SupplierHardDeletePreview | null;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function HardDeleteSupplierDialog({
  supplierName,
  preview,
  deleting,
  onCancel,
  onConfirm,
}: Props) {
  const [typed, setTyped] = useState("");
  const canConfirm =
    !!preview?.canDelete && typed === supplierName && !deleting;
  return (
    <AlertDialog open={!!preview} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>永久删除供应商「{supplierName}」</AlertDialogTitle>
          <AlertDialogDescription>
            仅用于误建的供应商。永久删除不可恢复；日常停用请使用「归档当前」。
          </AlertDialogDescription>
        </AlertDialogHeader>
        {preview && !preview.canDelete && (
          <div role="alert" className="space-y-1 text-sm text-destructive">
            <p>涉及资金或报关记录，不可永久删除：</p>
            <ul className="list-disc pl-5">
              {preview.blockers.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        )}
        {preview && (
          <div className="space-y-2 text-sm">
            <p className="font-medium">将同时永久删除：</p>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
              {Object.entries(COUNT_LABELS).map(([key, label]) => (
                <li key={key} className="flex justify-between">
                  <span>{label}</span>
                  <span className="tabular-nums">
                    {preview.counts[key] ?? 0}
                  </span>
                </li>
              ))}
            </ul>
            {preview.canDelete && (
              <Input
                aria-label="输入供应商名称确认"
                placeholder={`输入「${supplierName}」以确认`}
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
              />
            )}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={!canConfirm}
            onClick={onConfirm}
          >
            永久删除
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
