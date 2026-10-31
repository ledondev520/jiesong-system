/**
 * Input: HSCode 搜索/人工更新服务、AI 推荐接口（集成 HSCIQ 归类实例 + 官方税率）
 * Output: HSCode 查询页面（手机检索卡片、双搜索、AI 推荐、证据化人工税则更新、申报要素填写与复制）
 * Pos: 出口模块子页面 - HSCode 检索
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import { BusinessWrite } from "@/lib/hooks/useBusinessReadOnly";
import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import type { HsCodeRecord } from "@/types";
import { hsCodeService } from "@/services/hsCode.service";
import { toast } from "sonner";
import { runAwait } from "@/lib/run-await";
import { Sparkles } from "lucide-react";
import api from "@/lib/axios";
import type { ApiResponse } from "@/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { useTableSort } from "@/lib/hooks/useTableSort";
import { Button } from "@/components/ui/button";
import { HsCodeSearchCard } from "./components/HsCodeSearchCard";
import { HsCodeDetailCard } from "./components/HsCodeDetailCard";
import { HsCodeResultsCard } from "./components/HsCodeResultsCard";
import { HsCodeEditDialog } from "./components/HsCodeEditDialog";
import { HsCodeAiRecommendDialog } from "./components/HsCodeAiRecommendDialog";
import {
  type AiRecommendPayload,
  type DeclarationFillResult,
  type EvidenceEditForm,
} from "./hs-code-helpers";

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

function HsCodesPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialKeyword = searchParams.get("keyword") || "";
  const initialPage = parseInt(searchParams.get("page") || "1", 10);
  const initialPageSize = parseInt(searchParams.get("pageSize") || "20", 10);

  const initialCode = searchParams.get("code") || "";

  const [results, setResults] = useState<HsCodeRecord[]>([]);
  const [isFuzzy, setIsFuzzy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState(initialKeyword);
  const [hsCodeInput, setHsCodeInput] = useState(initialCode); // HS 编码前缀独立搜索框
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [selectedRecord, setSelectedRecord] = useState<HsCodeRecord | null>(
    null,
  );
  const [page, setPage] = useState(initialPage);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const debouncedKeyword = useDebouncedValue(keyword, 500);
  const debouncedHsCode = useDebouncedValue(hsCodeInput, 500);

  // AI 推荐状态
  const [aiRecommendOpen, setAiRecommendOpen] = useState(false);
  const [aiRecommendInput, setAiRecommendInput] = useState("");
  const [aiRecommendLoading, setAiRecommendLoading] = useState(false);
  const [aiRecommendResult, setAiRecommendResult] =
    useState<AiRecommendPayload | null>(null);
  const debouncedAiRecommendInput = useDebouncedValue(aiRecommendInput, 500);
  const aiRecommendReqIdRef = useRef(0);
  const runAiRecommendRef = useRef<(text: string) => Promise<void>>(
    async () => {},
  );
  // 一键复制标准格式状态（短暂显示 ✓）
  const [copied, setCopied] = useState(false);

  // 详情页 AI 辅助填写申报要素状态
  const [fillProductName, setFillProductName] = useState("");
  const [fillProductDescription, setFillProductDescription] = useState("");
  const [fillLoading, setFillLoading] = useState(false);
  const [fillResult, setFillResult] = useState<DeclarationFillResult>(null);
  const [fillCopied, setFillCopied] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState<EvidenceEditForm>({
    refundRate: "",
    exportTaxRate: "",
    vatRate: "",
    effectiveDate: "",
    sourceUrl: "",
    declarationElements: "",
    note: "",
  });

  // 切换到新记录时重置 AI 填写区状态（渲染期按记录 id 变化调整，替代 effect 内 setState）
  const [prevSelectedRecordId, setPrevSelectedRecordId] = useState(
    selectedRecord?.id,
  );
  if (prevSelectedRecordId !== selectedRecord?.id) {
    setPrevSelectedRecordId(selectedRecord?.id);
    setFillProductName("");
    setFillProductDescription("");
    setFillResult(null);
    setFillCopied(false);
  }

  const openEvidenceEditor = () => {
    if (!selectedRecord) return;
    setEditForm({
      refundRate:
        selectedRecord.refundRate == null
          ? ""
          : String(selectedRecord.refundRate),
      exportTaxRate:
        selectedRecord.exportTaxRate == null
          ? ""
          : String(selectedRecord.exportTaxRate),
      vatRate:
        selectedRecord.vatRate == null ? "" : String(selectedRecord.vatRate),
      effectiveDate: selectedRecord.effectiveDate
        ? new Date(selectedRecord.effectiveDate).toISOString().slice(0, 10)
        : "",
      sourceUrl: selectedRecord.sourceUrl || "",
      declarationElements: selectedRecord.declarationElements || "",
      note: selectedRecord.note || "",
    });
    setEditOpen(true);
  };

  const saveEvidenceUpdate = async () => {
    if (!selectedRecord) return;
    if (!editForm.effectiveDate || !editForm.sourceUrl.trim()) {
      toast.error("请填写生效日期和官方来源链接");
      return;
    }
    const toNullableNumber = (value: string) =>
      value.trim() === "" ? null : Number(value);
    setEditSaving(true);
    try {
      const response = await hsCodeService.update(selectedRecord.hsCode, {
        refundRate: toNullableNumber(editForm.refundRate),
        exportTaxRate: toNullableNumber(editForm.exportTaxRate),
        vatRate: toNullableNumber(editForm.vatRate),
        effectiveDate: editForm.effectiveDate,
        sourceUrl: editForm.sourceUrl.trim(),
        declarationElements: editForm.declarationElements.trim() || null,
        note: editForm.note.trim() || null,
      });
      const updated = response.data;
      if (updated) {
        setSelectedRecord(updated);
        setResults((previous) =>
          previous.map((record) =>
            record.hsCode === updated.hsCode ? updated : record,
          ),
        );
      }
      setEditOpen(false);
      toast.success("HS 税则证据已更新");
    } catch {
      toast.error("HS 税则更新失败，请检查税率、日期和来源链接");
    } finally {
      setEditSaving(false);
    }
  };

  /**
   * 职责：调用后端 AI 推荐接口
   * 思路：用递增请求 id 丢弃过期响应，避免防抖/连点乱序覆盖结果
   * @param text 产品描述（已 trim 由调用方保证非空时发起）
   * @param force 强制刷新（跳过并清除缓存）
   */
  const runAiRecommend = useCallback(async (text: string, force = false) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const id = ++aiRecommendReqIdRef.current;
    setAiRecommendLoading(true);
    setAiRecommendResult(null);
    try {
      const res = await api.post<
        ApiResponse<AiRecommendPayload>,
        ApiResponse<AiRecommendPayload>
      >("/hs-codes/ai-recommend", { productDescription: trimmed, force });
      if (id !== aiRecommendReqIdRef.current) return;
      setAiRecommendResult(res.data ?? null);
    } catch {
      if (id !== aiRecommendReqIdRef.current) return;
      toast.error("AI 推荐失败，请稍后重试");
    } finally {
      if (id === aiRecommendReqIdRef.current) {
        setAiRecommendLoading(false);
      }
    }
  }, []);

  // 渲染期不写 ref：提交后同步最新推荐函数（先于下方自动推荐 effect 执行）
  useEffect(() => {
    runAiRecommendRef.current = runAiRecommend;
  }, [runAiRecommend]);

  /**
   * 职责：手动点击「推荐」时校验非空再请求
   */
  const handleAiRecommendClick = () => {
    const text = aiRecommendInput.trim();
    if (!text) {
      toast.error("请输入产品描述");
      return;
    }
    void runAiRecommend(text);
  };

  /**
   * 职责：弹窗打开且输入停顿后自动发起推荐（无需再点按钮）
   * 思路：至少 2 个字符才自动请求（与列表模糊检索一致）；过短仅支持手动点按钮
   */
  useEffect(() => {
    if (!aiRecommendOpen) return;
    const text = debouncedAiRecommendInput.trim();
    if (text.length < 2) return;
    // 防抖未追上当前输入时不自动请求，避免弹窗重开时误用上一次描述
    if (debouncedAiRecommendInput !== aiRecommendInput) return;
    void runAiRecommendRef.current(text);
  }, [debouncedAiRecommendInput, aiRecommendInput, aiRecommendOpen]);

  /**
   * 职责：关闭弹窗时作废进行中的推荐请求，避免关闭后仍改状态
   */
  const handleAiRecommendDialogChange = useCallback(
    (open: boolean) => {
      if (!open) {
        aiRecommendReqIdRef.current += 1;
        setAiRecommendLoading(false);
      }
      setAiRecommendOpen(open);
    },
    [setAiRecommendOpen],
  );

  // 将分页/关键词/编码状态同步写入 URL，支持书签与浏览器回退
  const syncToUrl = useCallback(
    (kw: string, code: string, p: number, ps: number) => {
      const params = new URLSearchParams();
      if (kw) params.set("keyword", kw);
      if (code) params.set("code", code);
      if (p > 1) params.set("page", String(p));
      if (ps !== 20) params.set("pageSize", String(ps));
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [router, pathname],
  );

  /**
   * 职责：拉取 HS 编码搜索结果；状态只在请求回调中更新，可直接在 effect 中调用
   * @param searchKeyword - 商品名称关键词
   * @param searchCode - HS 编码前缀（纯数字）
   */
  const fetchResults = useCallback(
    ({
      searchKeyword,
      searchCode = "",
      nextPage,
      currentPageSize = pageSize,
    }: {
      searchKeyword: string;
      searchCode?: string;
      nextPage: number;
      currentPageSize?: number;
    }) => {
      // runAwait 与原 async try/await 时序一致；参数整理与原实现一样位于 try 范围内
      let hasInput = false;
      return runAwait(
        () => {
          const trimmedKw = searchKeyword.trim();
          const trimmedCode = searchCode.trim().replace(/\D/g, "");
          hasInput = trimmedKw.length >= 2 || trimmedCode.length >= 2;
          return hsCodeService.list({
            keyword: trimmedKw,
            code: trimmedCode,
            page: nextPage,
            pageSize: currentPageSize,
            fuzzy: hasInput,
          });
        },
        (response) => {
          setResults(response.data.items || []);
          setIsFuzzy(
            !!(response.data as { fuzzy?: boolean }).fuzzy && hasInput,
          );
          setTotal(response.data.pagination.total || 0);
          setTotalPages(response.data.pagination.totalPages || 1);
        },
        (error: unknown) => {
          console.error("HSCode 搜索失败:", error);
          toast.error("搜索失败，请稍后重试");
        },
        () => {
          setLoading(false);
        },
      );
    },
    [pageSize],
  );

  /**
   * 职责：事件中加载 HS 编码搜索结果（先进入加载态再拉取）
   */
  const loadResults = (params: Parameters<typeof fetchResults>[0]) => {
    setLoading(true);
    return fetchResults(params);
  };

  // 防抖后的关键词/编码变化时（含首次渲染，与原挂载 effect 一致）回到第 1 页；渲染期调整，替代 effect 内 setState
  const debouncedSearchKey = JSON.stringify([
    debouncedKeyword,
    debouncedHsCode,
  ]);
  const [prevDebouncedSearchKey, setPrevDebouncedSearchKey] = useState<
    string | null
  >(null);
  if (prevDebouncedSearchKey !== debouncedSearchKey) {
    setPrevDebouncedSearchKey(debouncedSearchKey);
    setPage(1);
  }

  // 列表查询条件变化时（含首次渲染）在渲染期同步进入加载态，请求仍在下方 effect 中发起
  const listQueryKey = JSON.stringify([
    debouncedKeyword,
    debouncedHsCode,
    page,
    pageSize,
  ]);
  const [prevListQueryKey, setPrevListQueryKey] = useState<string | null>(null);
  if (prevListQueryKey !== listQueryKey) {
    setPrevListQueryKey(listQueryKey);
    setLoading(true);
  }

  // 列表/搜索触发（关键词/编码/页码/每页条数变化时重新加载）
  useEffect(() => {
    const kw = debouncedKeyword.trim();
    const code = debouncedHsCode.trim().replace(/\D/g, "");
    void fetchResults({
      searchKeyword: kw,
      searchCode: code,
      nextPage: page,
      currentPageSize: pageSize,
    });
    syncToUrl(kw, code, page, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedKeyword, debouncedHsCode, page, pageSize]);

  const sort = useTableSort<HsCodeRecord, string>(
    results,
    useCallback((record, key) => {
      switch (key) {
        case "hsCode":
          return record.hsCode ?? "";
        case "productName":
          return record.productName ?? "";
        case "refundRate":
          return record.refundRate ?? null;
        default:
          return null;
      }
    }, []),
  );

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="HS 编码查询"
        description="默认展示全量列表。输入商品名称（可模糊）或 4–12 位纯数字 HS 编码（支持首尾空格，自动 trim）即可检索；编码按库内 hsCode 前缀精确匹配。"
        actions={
          <BusinessWrite>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAiRecommendOpen(true);
                setAiRecommendInput(keyword);
                setAiRecommendResult(null);
              }}
            >
              <Sparkles className="mr-2 h-4 w-4 text-primary" />
              AI 智能推荐
            </Button>
          </BusinessWrite>
        }
      />

      {/* 搜索栏：商品名称 + HS 编码分离 */}
      <HsCodeSearchCard
        keyword={keyword}
        setKeyword={setKeyword}
        hsCodeInput={hsCodeInput}
        setHsCodeInput={setHsCodeInput}
        debouncedKeyword={debouncedKeyword}
        debouncedHsCode={debouncedHsCode}
        pageSize={pageSize}
        setPageSize={setPageSize}
        setPage={setPage}
        loading={loading}
        loadResults={loadResults}
      />

      {/* 搜索结果 */}
      {selectedRecord ? (
        <HsCodeDetailCard
          selectedRecord={selectedRecord}
          setSelectedRecord={setSelectedRecord}
          openEvidenceEditor={openEvidenceEditor}
          fillProductName={fillProductName}
          setFillProductName={setFillProductName}
          fillProductDescription={fillProductDescription}
          setFillProductDescription={setFillProductDescription}
          fillLoading={fillLoading}
          setFillLoading={setFillLoading}
          fillResult={fillResult}
          setFillResult={setFillResult}
          fillCopied={fillCopied}
          setFillCopied={setFillCopied}
        />
      ) : (
        <HsCodeResultsCard
          results={results}
          loading={loading}
          isFuzzy={isFuzzy}
          keyword={keyword}
          hsCodeInput={hsCodeInput}
          page={page}
          setPage={setPage}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          sort={sort}
          setSelectedRecord={setSelectedRecord}
        />
      )}

      {/* 数据说明 */}
      <div className="mt-4 text-xs text-muted-foreground">
        数据来源：海关总署 - 当前列表 {results.length} 条 / 总计 {total} 条
        {keyword.trim() || hsCodeInput.trim()
          ? `（${[keyword.trim() && `名称：${keyword}`, hsCodeInput.trim() && `编码：${hsCodeInput}`].filter(Boolean).join("，")}）`
          : "（默认全量列表）"}
      </div>

      <HsCodeEditDialog
        editOpen={editOpen}
        setEditOpen={setEditOpen}
        editSaving={editSaving}
        editForm={editForm}
        setEditForm={setEditForm}
        saveEvidenceUpdate={saveEvidenceUpdate}
      />

      {/* AI 智能推荐弹窗 */}
      <HsCodeAiRecommendDialog
        aiRecommendOpen={aiRecommendOpen}
        handleAiRecommendDialogChange={handleAiRecommendDialogChange}
        aiRecommendInput={aiRecommendInput}
        setAiRecommendInput={setAiRecommendInput}
        aiRecommendLoading={aiRecommendLoading}
        aiRecommendResult={aiRecommendResult}
        handleAiRecommendClick={handleAiRecommendClick}
        runAiRecommend={runAiRecommend}
        copied={copied}
        setCopied={setCopied}
        setAiRecommendOpen={setAiRecommendOpen}
        setHsCodeInput={setHsCodeInput}
        setKeyword={setKeyword}
      />
    </div>
  );
}

export default function HsCodesPage() {
  return (
    <Suspense fallback={<div className="p-4">加载中...</div>}>
      <HsCodesPageContent />
    </Suspense>
  );
}
