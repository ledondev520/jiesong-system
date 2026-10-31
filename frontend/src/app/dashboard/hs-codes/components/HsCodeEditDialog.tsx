/**
 * Input: 证据化人工税则更新表单状态
 * Output: 人工更新税则弹窗
 * Pos: 出口模块子页面 - HSCode 检索（page.tsx 拆分）
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import { BusinessWrite } from "@/lib/hooks/useBusinessReadOnly";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Dispatch, SetStateAction } from "react";
import { type EvidenceEditForm } from "../hs-code-helpers";

export function HsCodeEditDialog({
  editOpen,
  setEditOpen,
  editSaving,
  editForm,
  setEditForm,
  saveEvidenceUpdate,
}: {
  editOpen: boolean;
  setEditOpen: (open: boolean) => void;
  editSaving: boolean;
  editForm: EvidenceEditForm;
  setEditForm: Dispatch<SetStateAction<EvidenceEditForm>>;
  saveEvidenceUpdate: () => unknown;
}) {
  return (
    <>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl">
          <DialogHeader>
            <DialogTitle>人工更新 HS 税则证据</DialogTitle>
            <DialogDescription>
              修改税率会影响出口警示与预计退税，必须同时留存生效日期和可追溯的官方来源链接。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="hs-refund-rate">出口退税率（%）</Label>
              <Input
                id="hs-refund-rate"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={editForm.refundRate}
                onChange={(event) =>
                  setEditForm((form) => ({
                    ...form,
                    refundRate: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hs-export-tax-rate">出口税率（%）</Label>
              <Input
                id="hs-export-tax-rate"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={editForm.exportTaxRate}
                onChange={(event) =>
                  setEditForm((form) => ({
                    ...form,
                    exportTaxRate: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hs-vat-rate">增值税率（%）</Label>
              <Input
                id="hs-vat-rate"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={editForm.vatRate}
                onChange={(event) =>
                  setEditForm((form) => ({
                    ...form,
                    vatRate: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-1">
              <Label htmlFor="hs-effective-date">生效日期</Label>
              <Input
                id="hs-effective-date"
                type="date"
                value={editForm.effectiveDate}
                onChange={(event) =>
                  setEditForm((form) => ({
                    ...form,
                    effectiveDate: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="hs-source-url">官方来源链接</Label>
              <Input
                id="hs-source-url"
                type="url"
                placeholder="https://..."
                value={editForm.sourceUrl}
                onChange={(event) =>
                  setEditForm((form) => ({
                    ...form,
                    sourceUrl: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-3">
              <Label htmlFor="hs-declaration-template">申报要素模板</Label>
              <Textarea
                id="hs-declaration-template"
                rows={2}
                placeholder="用 | 分隔各项；这里只保存模板，不代替具体商品的实际申报值"
                value={editForm.declarationElements}
                onChange={(event) =>
                  setEditForm((form) => ({
                    ...form,
                    declarationElements: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-3">
              <Label htmlFor="hs-evidence-note">复核备注</Label>
              <Textarea
                id="hs-evidence-note"
                rows={2}
                value={editForm.note}
                onChange={(event) =>
                  setEditForm((form) => ({ ...form, note: event.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditOpen(false)}
              disabled={editSaving}
            >
              取消
            </Button>
            <BusinessWrite>
              <Button
                type="button"
                onClick={() => void saveEvidenceUpdate()}
                disabled={editSaving}
              >
                {editSaving && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                保存税则证据
              </Button>
            </BusinessWrite>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
