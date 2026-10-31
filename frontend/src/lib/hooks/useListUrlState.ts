"use client";

import { CustomsDeclarationStatus } from "@/types";
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
  // 财务报表页内页签（?view=）
  statements: {
    view: {
      default: "overview",
      values: ["overview", "balance", "income", "cashflow", "ledger", "library"],
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
  inventory: {
    keyword: { default: "", key: "inventoryKeyword", resetPage: true },
    page: { default: 1, key: "inventoryPage" },
    pageSize: {
      default: 20,
      key: "inventoryPageSize",
      values: [20, 50, 100],
      resetPage: true,
    },
  },
  productTabs: {
    tab: { default: "products", values: ["products", "inventory"] },
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
