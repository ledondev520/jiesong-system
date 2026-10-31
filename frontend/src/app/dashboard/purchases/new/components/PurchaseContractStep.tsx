/**
 * Input: 采购表单、供应商选择状态
 * Output: 步骤 2：合同详情（供应商/合同号/签订日期/税率）与提交按钮
 * Pos: 采购合同创建入口（CreatePurchasePageContent 拆分）
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import { useRouter } from "next/navigation";
import { type UseFormReturn } from "react-hook-form";
import { Supplier } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  UserPlus,
  Check,
  ChevronsUpDown,
  Star,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type PurchaseFormValues,
  type RecommendedSupplier,
} from "./purchaseFormParts";

export function PurchaseContractStep({
  form,
  editId,
  router,
  dataLoading,
  loadError,
  contractNoLoading,
  goToStep1,
  supplierOpen,
  setSupplierOpen,
  supplierSearch,
  setSupplierSearch,
  sortedSuppliers,
  recommendedSupplierIds,
  selectedSupplier,
  changeSupplierDialog,
}: {
  form: UseFormReturn<PurchaseFormValues>;
  editId: string | null;
  router: ReturnType<typeof useRouter>;
  dataLoading: boolean;
  loadError: boolean;
  contractNoLoading: boolean;
  goToStep1: () => void;
  supplierOpen: boolean;
  setSupplierOpen: (open: boolean) => void;
  supplierSearch: string;
  setSupplierSearch: (value: string) => void;
  sortedSuppliers: RecommendedSupplier[];
  recommendedSupplierIds: Set<string>;
  selectedSupplier: Supplier | undefined;
  changeSupplierDialog: (open: boolean, name?: string) => void;
}) {
  return (
    <>
      {/* 合同详情 */}
      <Card className="overflow-hidden rounded-xl border-border/40 shadow-[0_1px_3px_rgba(0,0,0,0.05)] md:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">合同信息</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-3">
          {/* 合同编号 */}
          <FormField
            control={form.control}
            name="contractNo"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">合同编号</FormLabel>
                <FormControl>
                  {contractNoLoading ? (
                    <div className="flex h-10 items-center gap-2 rounded-md border border-border/60 bg-muted px-3 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      生成中...
                    </div>
                  ) : (
                    <Input
                      {...field}
                      disabled
                      className="h-10 rounded-md font-mono text-xs"
                    />
                  )}
                </FormControl>
              </FormItem>
            )}
          />

          {/* 供应商 Combobox */}
          <FormField
            control={form.control}
            name="supplierId"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <div className="flex items-center justify-between">
                  <FormLabel className="text-xs">
                    供应商 <span className="text-destructive">*</span>
                  </FormLabel>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    disabled={dataLoading || loadError}
                    onClick={() => changeSupplierDialog(true)}
                  >
                    <UserPlus className="mr-1 h-3 w-3" />
                    新增
                  </Button>
                </div>
                <Popover open={supplierOpen} onOpenChange={setSupplierOpen}>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        role="combobox"
                        disabled={dataLoading || loadError}
                        aria-expanded={supplierOpen}
                        className={cn(
                          "h-10 justify-between rounded-md text-xs font-normal",
                          !field.value && "text-muted-foreground",
                        )}
                      >
                        {selectedSupplier
                          ? selectedSupplier.name
                          : "搜索或选择供应商..."}
                        <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[400px] max-w-[calc(100vw-2rem)] p-0"
                    align="start"
                  >
                    <Command shouldFilter={false}>
                      <Label
                        htmlFor="purchase-supplier-search"
                        className="sr-only"
                      >
                        搜索供应商
                      </Label>
                      <CommandInput
                        id="purchase-supplier-search"
                        name="supplierSearch"
                        aria-label="搜索供应商"
                        placeholder="输入供应商名称搜索..."
                        value={supplierSearch}
                        onValueChange={setSupplierSearch}
                      />
                      <CommandList>
                        <CommandEmpty>
                          <div className="py-2">
                            <p className="text-muted-foreground">
                              未找到匹配供应商
                            </p>
                            <Button
                              type="button"
                              variant="link"
                              size="sm"
                              disabled={dataLoading || loadError}
                              onClick={() => {
                                changeSupplierDialog(true, supplierSearch);
                                setSupplierOpen(false);
                              }}
                            >
                              {`+ 新增 "${supplierSearch}"`}
                            </Button>
                          </div>
                        </CommandEmpty>
                        {recommendedSupplierIds.size > 0 &&
                          sortedSuppliers.some((s) => s.isRecommended) && (
                            <CommandGroup heading="推荐供应商">
                              {sortedSuppliers
                                .filter((s) => s.isRecommended)
                                .map((s) => (
                                  <CommandItem
                                    key={s.id}
                                    value={s.id}
                                    disabled={dataLoading || loadError}
                                    onSelect={() => {
                                      field.onChange(s.id);
                                      setSupplierOpen(false);
                                      setSupplierSearch("");
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        field.value === s.id
                                          ? "opacity-100"
                                          : "opacity-0",
                                      )}
                                    />
                                    <Star className="mr-1 h-3 w-3 text-primary" />
                                    <span>{s.name}</span>
                                    {s.contactName && (
                                      <span className="ml-2 text-xs text-muted-foreground">
                                        ({s.contactName})
                                      </span>
                                    )}
                                    <Badge
                                      variant="secondary"
                                      className="ml-auto text-xs"
                                    >
                                      曾供应
                                    </Badge>
                                  </CommandItem>
                                ))}
                            </CommandGroup>
                          )}
                        <CommandGroup
                          heading={
                            recommendedSupplierIds.size > 0
                              ? "全部供应商"
                              : "供应商列表"
                          }
                        >
                          {sortedSuppliers
                            .filter((s) => !s.isRecommended)
                            .map((s) => (
                              <CommandItem
                                key={s.id}
                                value={s.id}
                                disabled={dataLoading || loadError}
                                onSelect={() => {
                                  field.onChange(s.id);
                                  setSupplierOpen(false);
                                  setSupplierSearch("");
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    field.value === s.id
                                      ? "opacity-100"
                                      : "opacity-0",
                                  )}
                                />
                                <span>{s.name}</span>
                                {s.contactName && (
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    ({s.contactName})
                                  </span>
                                )}
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* 签订日期 */}
          <FormField
            control={form.control}
            name="signedAt"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <Label htmlFor="purchase-signed-at" className="mb-1.5 text-xs">
                  签订日期
                </Label>
                <DatePicker
                  date={field.value}
                  setDate={field.onChange}
                  triggerProps={{
                    id: "purchase-signed-at",
                    name: "signedAt",
                  }}
                />
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="expectedDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <Label
                  htmlFor="purchase-expected-date"
                  className="mb-1.5 text-xs"
                >
                  预计交期
                </Label>
                <DatePicker
                  date={field.value}
                  setDate={field.onChange}
                  triggerProps={{
                    id: "purchase-expected-date",
                    name: "expectedDate",
                  }}
                />
                <FormMessage />
              </FormItem>
            )}
          />

          {/* 税率 */}
          <FormField
            control={form.control}
            name="taxRate"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">
                  税率 (%) <span className="text-destructive">*</span>
                </FormLabel>
                <Select
                  onValueChange={(val) => field.onChange(Number(val))}
                  defaultValue={String(field.value)}
                >
                  <FormControl>
                    <SelectTrigger className="h-10 rounded-md text-xs">
                      <SelectValue placeholder="选择税率" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="1">1% (小规模纳税人)</SelectItem>
                    <SelectItem value="13">13% (一般纳税人)</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* 备注 */}
          <div className="md:col-span-3">
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">备注</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="填写合同备注信息（可选）"
                      className="min-h-[80px] rounded-md"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </CardContent>
      </Card>

      {/* 提交按钮 */}
      <div className="flex justify-end gap-3 md:col-span-2">
        <Button
          type="button"
          variant="outline"
          className="h-10 rounded-md text-sm"
          onClick={goToStep1}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          上一步
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-10 rounded-md text-sm"
          onClick={() => router.back()}
        >
          取消
        </Button>
        <Button
          type="submit"
          className="h-10 rounded-md text-sm"
          disabled={form.formState.isSubmitting || dataLoading || loadError}
        >
          {form.formState.isSubmitting
            ? "提交中..."
            : editId
              ? "保存更正"
              : "创建合同"}
        </Button>
      </div>
    </>
  );
}
