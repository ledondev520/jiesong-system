/**
 * Input: 粘贴文本（制表符：商品、门店、数量、成本¥）、该客户的门店
 * Output: 解析并匹配后的订单行；匹配不到的商品/门店列出问题，不猜测、不新建
 * Pos: 订单编辑器「从 Excel 粘贴」
 */
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { parsePastedRows, resolvePastedRows, type OrderLine, type StoreRef } from "@/lib/order-lines";
import { productService } from "@/services/product.service";

interface PasteRowsDialogProps {
  stores: StoreRef[];
  onClose: () => void;
  onAdd: (lines: OrderLine[]) => void;
}

export function PasteRowsDialog({ stores, onClose, onAdd }: PasteRowsDialogProps) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);

  const submit = async () => {
    const rows = parsePastedRows(text);
    if (rows.length === 0) return setProblems(["没有可识别的行"]);
    if (rows.length > 100) return setProblems(["一次最多粘贴 100 行"]);
    setBusy(true);
    try {
      const cache = new Map<string, { id: string; customsName: string; unit?: string } | null>();
      const result = await resolvePastedRows(rows, stores, async (name) => {
        if (!cache.has(name)) {
          const response = await productService.getAll({ keyword: name, pageSize: 20, lite: true });
          // 只接受名称整串相等的商品，避免把「瓷砖」误配到「瓷砖胶」
          cache.set(name, response?.data.items.find((product) => product.customsName === name) ?? null);
        }
        return cache.get(name) ?? null;
      });
      if (result.lines.length > 0) onAdd(result.lines);
      if (result.problems.length > 0) setProblems(result.problems);
      else onClose();
    } catch {
      setProblems(["匹配商品时出错，请重试"]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>从 Excel 粘贴</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          列顺序：商品名称、门店（简称或名称）、数量、采购成本 ¥（可空）。商品名称须与档案完全一致。
        </p>
        <Textarea
          aria-label="粘贴内容"
          rows={8}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={"不锈钢门\tSAC\t120\t85.5"}
        />
        {problems.length > 0 ? (
          <ul role="alert" className="max-h-32 list-disc space-y-1 overflow-auto pl-5 text-sm text-destructive">
            {problems.map((problem) => <li key={problem}>{problem}</li>)}
          </ul>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>取消</Button>
          <Button onClick={() => void submit()} disabled={busy || !text.trim()}>
            {busy ? "匹配中..." : "添加到订单"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
