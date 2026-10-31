"use client";

import { CustomsDeclarationStatus } from "@/types";
import { QUOTE_STATUSES } from "@/lib/quote";
import { useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { replaceBrowserQuery, useBrowserQuery } from "./useBrowserQuery";

type Field = {
  default: string | number;
  key?: string;
  values?: readonly (string | number)[];
  resetPage?: boolean;
};
type Fields = Record<string, Field>;
type State<T extends Fields> = {
  [K in keyof T]: T[K]["default"] extends number ? number : string;
};

export const listUrlFields = {
  customers: {
    keyword: { default: "", resetPage: true },
    archived: { default: "no", values: ["no", "yes"], resetPage: true },
    page: { default: 1 },
    pageSize: { default: 20, values: [20, 50, 100], resetPage: true },
  },
  // 出口订单列表；沿用旧 /dashboard/sales 的查询参数名（q、status、shipped、shippedFrom/To、storeId）
  orders: {
    keyword: { default: "", key: "q", resetPage: true },
    status: { default: "", resetPage: true },
    shipped: { default: "", values: ["", "true"], resetPage: true },
    shippedFrom: { default: "", resetPage: true },
    shippedTo: { default: "", resetPage: true },
    storeId: { default: "", resetPage: true },
    page: { default: 1 },
    pageSize: { default: 20, values: [20, 50, 100], resetPage: true },
  },
  // 财务报表页内页签（?view=）
  statements: {
    view: {
      default: "overview",
      values: [
        "overview",
        "balance",
        "income",
        "cashflow",
        "ledger",
        "library",
      ],
    },
  },
  customs: {
    keyword: { default: "", resetPage: true },
    status: {
      default: "ALL",
      values: ["ALL", ...Object.values(CustomsDeclarationStatus)],
      resetPage: true,
    },
    page: { default: 1 },
    pageSize: { default: 20, values: [20, 50, 100], resetPage: true },
  },
  quotes: {
    keyword: { default: "", resetPage: true },
    status: {
      default: "ALL",
      values: ["ALL", ...QUOTE_STATUSES],
      resetPage: true,
    },
    page: { default: 1 },
    pageSize: { default: 20, values: [20, 50, 100], resetPage: true },
  },
  inventory: {
    keyword: { default: "", key: "inventoryKeyword", resetPage: true },
    store: { default: "", key: "inventoryStore", resetPage: true },
    page: { default: 1, key: "inventoryPage" },
    pageSize: {
      default: 20,
      key: "inventoryPageSize",
      values: [20, 50, 100],
      resetPage: true,
    },
  },
} as const satisfies Record<string, Fields>;

function readField(value: string | null, field: Field) {
  if (value === null) return field.default;
  const parsed = typeof field.default === "number" ? Number(value) : value;
  if (
    (typeof parsed === "number" &&
      (!Number.isSafeInteger(parsed) || parsed < 1)) ||
    (field.values && !field.values.includes(parsed))
  ) {
    return field.default;
  }
  return parsed;
}

export function useListUrlState<T extends Fields>(
  fields: T,
  activeWhen?: readonly [string, string],
) {
  const serverParams = useSearchParams();
  const query = useBrowserQuery(serverParams?.toString() ?? "");
  const params = new URLSearchParams(query);
  const state = Object.fromEntries(
    Object.entries(fields).map(([name, field]) => [
      name,
      readField(params.get(field.key ?? name), field),
    ]),
  ) as State<T>;
  const guardKey = activeWhen?.[0];
  const guardValue = activeWhen?.[1];

  const setState = useCallback(
    (patch: Partial<State<T>>) => {
      const current = new URLSearchParams(window.location.search);
      if (guardKey && current.get(guardKey) !== guardValue) return;
      const updates: Record<string, string | undefined> = {};
      let resetPage = false;
      for (const [name, value] of Object.entries(patch)) {
        const field = fields[name];
        if (!field || value === undefined) continue;
        const parsed = readField(String(value), field);
        updates[field.key ?? name] =
          parsed === field.default ? undefined : String(parsed);
        resetPage ||= Boolean(field.resetPage);
      }
      if (resetPage && fields.page)
        updates[fields.page.key ?? "page"] = undefined;
      replaceBrowserQuery(updates);
    },
    [fields, guardKey, guardValue],
  );

  return [state, setState] as const;
}
