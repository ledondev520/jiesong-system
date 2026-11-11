/**
 * Input: 模板名称与保存状态
 * Output: 保存为合同模板弹窗
 * Pos: 采购合同创建入口（CreatePurchasePageContent 拆分）
 */

"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export function SaveTemplateDialog({
  showSaveTemplateDialog,
  setShowSaveTemplateDialog,
  templateName,
  setTemplateName,
  savingTemplate,
  handleSaveTemplate,
}: {
  showSaveTemplateDialog: boolean;
  setShowSaveTemplateDialog: (open: boolean) => void;
  templateName: string;
  setTemplateName: (value: string) => void;
  savingTemplate: boolean;
  handleSaveTemplate: () => unknown;
}) {
  return (
    <>
      <Dialog
        open={showSaveTemplateDialog}
        onOpenChange={setShowSaveTemplateDialog}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-sm font-medium">
              保存为模板
            </DialogTitle>
            <DialogDescription>
              将当前采购明细保存为之后可重复使用的合同模板。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="template-name">模板名称</Label>
            <Input
              id="template-name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="例如：标准瓷砖采购模板"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSaveTemplateDialog(false)}
            >
              取消
            </Button>
            <Button onClick={handleSaveTemplate} disabled={savingTemplate}>
              {savingTemplate ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
