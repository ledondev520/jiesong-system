/**
 * Input: 搜索关键词、HS 编码前缀、分页大小
 * Output: 商品名称 / HS 编码双搜索栏
 * Pos: 出口模块子页面 - HSCode 检索（page.tsx 拆分）
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import { Input } from "@/components/ui/input";
import { Search, X, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import type { Dispatch, SetStateAction } from "react";
import { type HsSearchParams } from "../hs-code-helpers";

export function HsCodeSearchCard({
  keyword,
  setKeyword,
  hsCodeInput,
  setHsCodeInput,
  debouncedKeyword,
  debouncedHsCode,
  pageSize,
  setPageSize,
  setPage,
  loading,
  loadResults,
}: {
  keyword: string;
  setKeyword: (value: string) => void;
  hsCodeInput: string;
  setHsCodeInput: (value: string) => void;
  debouncedKeyword: string;
  debouncedHsCode: string;
  pageSize: number;
  setPageSize: (size: number) => void;
  setPage: Dispatch<SetStateAction<number>>;
  loading: boolean;
  loadResults: (params: HsSearchParams) => unknown;
}) {
  return (
    <>
      {/* 搜索栏：商品名称 + HS 编码分离 */}
      <Card className="mb-4">
        <CardContent className="pt-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {/* 商品名称搜索 */}
            <div className="relative min-w-0 flex-1">
              {loading ? (
                <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
              ) : (
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              )}
              <Input
                placeholder="商品名称（支持模糊匹配）"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="pl-10 pr-9"
              />
              {keyword && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setKeyword("");
                    setPage(1);
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {/* HS 编码前缀搜索 */}
            <div className="relative w-full sm:w-[200px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground select-none">
                HS
              </span>
              <Input
                placeholder="编码前缀（4–10位）"
                value={hsCodeInput}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 12);
                  setHsCodeInput(v);
                }}
                className="pl-9 pr-9 font-mono tabular-nums"
                inputMode="numeric"
              />
              {hsCodeInput && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setHsCodeInput("");
                    setPage(1);
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                const ps = Number(v);
                setPageSize(ps);
                setPage(1);
                loadResults({
                  searchKeyword: debouncedKeyword,
                  searchCode: debouncedHsCode,
                  nextPage: 1,
                  currentPageSize: ps,
                });
              }}
            >
              <SelectTrigger className="h-10 w-full sm:w-[90px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="20">20 条</SelectItem>
                <SelectItem value="50">50 条</SelectItem>
                <SelectItem value="100">100 条</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
