/**
 * Input: Existing stores, selected store, and the authenticated user's role
 * Output: Searchable store field; new stores are added under 客户与门店 (no inline creation)
 * Pos: Export-contract creation; see ../README.md
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Store as StoreIcon } from "lucide-react";
import { FormControl } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Store } from "@/types";

interface StoreSelectProps {
  stores: Store[];
  value: string;
  onChange: (value: string) => void;
}

export function StoreSelect({ stores, value, onChange }: StoreSelectProps) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const filteredStores = stores.filter(
    (store) =>
      store.id === value ||
      store.name.toLowerCase().includes(query) ||
      store.port?.name.toLowerCase().includes(query),
  );

  return (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="搜索门店"
          placeholder="搜索门店..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="mb-1.5 h-9 pl-8 text-sm"
        />
      </div>
      <Select
        value={value}
        onValueChange={(id) => {
          // Radix's hidden native select can emit an empty value while options mount.
          // This required field has no clear action; keep the current selection.
          if (id) onChange(id);
        }}
      >
        <FormControl>
          <SelectTrigger className="h-9 w-full">
            <SelectValue placeholder="选择门店" />
          </SelectTrigger>
        </FormControl>
        <SelectContent className="max-h-[280px]">
          {filteredStores.map((store) => (
            <SelectItem key={store.id} value={store.id}>
              <div className="flex items-center gap-2">
                <StoreIcon className="h-3 w-3 text-muted-foreground" />
                <span>{store.name}</span>
                {store.port?.name && (
                  <span className="text-[10px] text-muted-foreground">
                    {store.port.name}
                  </span>
                )}
              </div>
            </SelectItem>
          ))}
          {filteredStores.length === 0 && (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              {stores.length === 0 ? "暂无门店" : "没有匹配的门店"}
            </p>
          )}
        </SelectContent>
      </Select>
      {stores.length === 0 && (
        <p className="text-xs text-muted-foreground">
          暂无门店，请先到{" "}
          <Link href="/dashboard/customers" className="underline">
            客户与门店
          </Link>{" "}
          添加。
        </p>
      )}
    </>
  );
}
