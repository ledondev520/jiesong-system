/**
 * Input: Existing stores, selected store, and the authenticated user's role
 * Output: Searchable store field with inline creation using the existing store API
 * Pos: Export-contract creation; see ../README.md
 */

"use client";

import { useRef, useState } from "react";
import { Plus, Search, Store as StoreIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormControl } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuthStore } from "@/store/auth.store";
import { Role, type Store } from "@/types";
import { CreateStoreDialog } from "./CreateStoreDialog";

// Match POST /stores. The backend remains the authority for every write.
const STORE_CREATE_ROLES: Role[] = [
  Role.ADMIN,
  Role.PURCHASE,
  Role.SALES,
  Role.FINANCE,
  Role.WAREHOUSE,
];

interface StoreSelectProps {
  stores: Store[];
  value: string;
  onChange: (value: string) => void;
  onCreated: (store: Store) => void;
}

export function StoreSelect({
  stores,
  value,
  onChange,
  onCreated,
}: StoreSelectProps) {
  const role = useAuthStore((state) => state.user?.role);
  const canCreate = !!role && STORE_CREATE_ROLES.includes(role);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const createButton = useRef<HTMLButtonElement>(null);
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
          // Radix's hidden native select can emit an empty value while new options mount.
          // This required field has no clear action; do not erase a just-created selection.
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
          {canCreate
            ? "暂无门店，可先新增门店后继续填写。"
            : "暂无门店，请联系业务人员维护。"}
        </p>
      )}
      {canCreate && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setCreating(true)}
          ref={createButton}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          新增门店
        </Button>
      )}
      {canCreate && creating && (
        <CreateStoreDialog
          onClose={() => setCreating(false)}
          onRestoreFocus={() => createButton.current?.focus()}
          onCreated={(store) => {
            onCreated(store);
            setSearch("");
            onChange(store.id);
            setCreating(false);
          }}
        />
      )}
    </>
  );
}
