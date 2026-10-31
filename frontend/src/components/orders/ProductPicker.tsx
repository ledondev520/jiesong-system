/**
 * Input: 搜索关键词（服务端搜索，不再一次拉取前 100 个商品）、当前所选商品
 * Output: 可搜索的商品选择框；选择后回调商品 id/名称/单位
 * Pos: 订单编辑器；修复旧订单页商品列表被 100 行截断的问题
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { productService } from "@/services/product.service";
import type { Product } from "@/types";

interface ProductPickerProps {
  value: { id: string; name: string } | null;
  onSelect: (product: Pick<Product, "id" | "customsName" | "unit">) => void;
  ariaLabel?: string;
}

export function ProductPicker({ value, onSelect, ariaLabel = "搜索商品" }: ProductPickerProps) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const latest = useRef(0);

  useEffect(() => {
    if (!open || !text.trim()) return;
    const ticket = ++latest.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await productService.getAll({ keyword: text.trim(), pageSize: 20, lite: true });
        if (ticket !== latest.current) return; // 迟到的旧响应不覆盖新搜索
        setResults(response?.data.items ?? []);
        setFailed(false);
      } catch {
        if (ticket === latest.current) setFailed(true);
      } finally {
        if (ticket === latest.current) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [text, open]);

  return (
    <div className="relative">
      <Input
        aria-label={ariaLabel}
        placeholder={value?.name || "搜索商品名称..."}
        value={open ? text : value?.name ?? ""}
        onFocus={() => {
          setOpen(true);
          setText("");
        }}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="h-9"
      />
      {open && text.trim() ? (
        <ul role="listbox" className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md">
          {searching ? <li className="px-2 py-1.5 text-muted-foreground">搜索中...</li> : null}
          {failed ? <li className="px-2 py-1.5 text-destructive">搜索失败，请重试</li> : null}
          {!searching && !failed && results.length === 0 ? <li className="px-2 py-1.5 text-muted-foreground">没有匹配的商品</li> : null}
          {results.map((product) => (
            <li key={product.id}>
              <button
                type="button"
                role="option"
                aria-selected={value?.id === product.id}
                className="w-full rounded px-2 py-1.5 text-left hover:bg-accent"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(product);
                  setOpen(false);
                }}
              >
                {product.customsName}
                {product.unit ? <span className="ml-2 text-xs text-muted-foreground">{product.unit}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
